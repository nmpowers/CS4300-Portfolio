var canvas;
var gl;
var program;

// shader data locations
var modelViewMatrixLoc;
var projectionMatrixLoc;
var vertexObject = null;

// default splat instance count
var numInstances = 0;

// Camera control vars
var camX = 0.0;
var camY = 0.0;
var camZ = 2.0;
var flySpeed = 0.2;

// Model transformation vars
var dragging = false;
var prevMouseX = -1;
var prevMouseY = -1;
var modelRotationX = 0.0;
var modelRotationY = 0.0;
var modelRotationZ = 0.0;
var modelTranslationX = 0.0;
var modelTranslationY = 0.0;
var modelTranslationZ = 0.0;

// frame-buffer vars for frame relighting
var gBuffer;
var colorTexture;
var posTexture;
var depthBuffer;

// lighting variables
var lightingProgram;
var screenBackground;
var colorTexLoc;
var posTexLoc;
var bilatBlurWidth = 5.0;
var bilatBlurSharpness = 1.0;
var splatAmbientBrightness = 0.3;
var splatPointSize = 0.006; // scale of each rendered point/splat quad, user-adjustable

// Mesh vars
var meshToggle = false; // keeping track of whether mesh mode has been toggled
var meshVertexObj = null; // separate vertex object for rendering geometry
var meshICount; // index count
var meshIType; // index type
var meshProgram; // for separate lighting
var defaultMeshTex; // mesh texture
var glbTexture = null; // texture pulled from glb object
var glassToggle = false;

// Skybox vars
var sbCubeMap;
var sbObject;
var sbPoints = [];
var sbVertices = [ // 3D box around camera
    vec4( -0.5, -0.5,  0.5, 1.0 ), // Top back left
    vec4( -0.5,  0.5,  0.5, 1.0 ), // Top front left
    vec4( 0.5,  0.5,  0.5, 1.0 ),  // Top front right
    vec4( 0.5, -0.5,  0.5, 1.0 ), // Top back right
    vec4( -0.5, -0.5, -0.5, 1.0 ), // Bottom back left
    vec4( -0.5,  0.5, -0.5, 1.0 ), // Bottom front left
    vec4( 0.5,  0.5, -0.5, 1.0 ),  // Bottom front right
    vec4( 0.5, -0.5, -0.5, 1.0 ) // Bottom back right
];

// Mesh lighting vars
var lightPosition = vec4(0.2, 4.0, 2.0, 1.0 );
var lightAmbient = vec4(0.2, 0.2, 0.2, 1.0 );
var lightDiffuse = vec4( 1.0, 1.0, 1.0, 1.0 );
var lightSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );

var materialAmbient = vec4( 1.0, 0.0, 1.0, 1.0 );
var materialDiffuse = vec4( 1.0, 1.0, 0.0, 1.0 );
var materialSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );
var materialShininess = 20.0;

// Spotlight vars
var spotDirection = vec3(0.0, 0.0, -1.0);
var spotlightAngle = 5.0;
var spotCutoff = Math.cos(spotlightAngle * Math.PI / 180.0); // finding once here to pass down
var spotDropoff = 20.0
var floorObject;
var lightToggle = true;
var shadowToggle = true;
var diffuseToggle = true;
var specularToggle = true;

// Hierarchy vars
var hatCount = 0;
var hatObject;
var hatICount = 0;
var hatIType;
var hatTexture = null;
var hatVertexCount = 0;


/**
 * This asynchronous function parses the data from a .glb file using the loaders.gl library. The details of the
 * glb file are returned in an object of parameters.
 *
 * The loaders.gl library was chosen here for simplicity of setup and the fact that it will
 * not do the heavy lifting of rendering lighting, shadows, and more-- as opposed to other libraries
 * which are much heavier and do more than needed.
 *
 * @param url The path for the .glb model file to be parsed.
 * @returns {Promise<{positions, normals: (*|null), uvs: (*|null), indices, indexType: (0x1405|0x1403), indexCount}>}
 *          A promised object containing the positions of the vertices, the normals and uv maps, the indices, their amount, and their type.
 */
async function loadGLB(url) {
    console.log("Getting GLB data with loaders.gl library.");

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    // request loaders parse function
    const gltf = await loaders.parse(arrayBuffer, loaders.GLTFLoader);

    // get primitive object from mesh
    const primitive = gltf.meshes[0].primitives[0];

    let textureImage = null;
    if (gltf.images && gltf.images.length > 0) {
        textureImage = gltf.images[0].image;
        console.log("GLB has texture");
    }

    let indices = null;
    let indexType = null;
    let indexCount = 0;

    if (primitive.indices) {
        indices = primitive.indices.value;
        indexCount = indices.length;
        if (indices instanceof Uint32Array) indexType = gl.UNSIGNED_INT;
        else if (indices instanceof Uint16Array) indexType = gl.UNSIGNED_SHORT;
        else if (indices instanceof Uint8Array) indexType = gl.UNSIGNED_BYTE;
    }

    // need to manually calculate size of the color vectors (RGB is 3 and RGBA is 4)
    // for some reason it seems that the passed size is undefined, which is resulting in
    // the shading calculations crashing. We are assuming RGBA here
    let cSize = 4;


    console.log("GLB data successfully loaded.");

    return {
        positions: primitive.attributes.POSITION.value,
        normals: primitive.attributes.NORMAL ? primitive.attributes.NORMAL.value : null,
        uvs: primitive.attributes.TEXCOORD_0 ? primitive.attributes.TEXCOORD_0.value : null,
        colors: primitive.attributes.COLOR_0 ? primitive.attributes.COLOR_0.value : null,
        colorSize: cSize,
        indices: indices,
        indexType: indexType,
        indexCount: indexCount,
        image: textureImage
    };
}

// byte size of each scalar type name that can appear in a PLY header
const PLY_TYPE_SIZES = {
    char: 1, uchar: 1, int8: 1, uint8: 1,
    short: 2, ushort: 2, int16: 2, uint16: 2,
    int: 4, uint: 4, int32: 4, uint32: 4,
    float: 4, float32: 4,
    double: 8, float64: 8
};

/**
 * Reads a single scalar value of the given PLY property type out of a DataView at a byte offset.
 *
 * @param dataView The DataView to read from.
 * @param offset The byte offset to read at.
 * @param type The PLY property type name (e.g. "float", "uchar", "int").
 * @param littleEndian Whether the file is little-endian (all PLY types except binary_big_endian are).
 * @returns {number} The decoded scalar value.
 */
function readPLYScalar(dataView, offset, type, littleEndian) {
    switch (type) {
        case 'char': case 'int8': return dataView.getInt8(offset);
        case 'uchar': case 'uint8': return dataView.getUint8(offset);
        case 'short': case 'int16': return dataView.getInt16(offset, littleEndian);
        case 'ushort': case 'uint16': return dataView.getUint16(offset, littleEndian);
        case 'int': case 'int32': return dataView.getInt32(offset, littleEndian);
        case 'uint': case 'uint32': return dataView.getUint32(offset, littleEndian);
        case 'float': case 'float32': return dataView.getFloat32(offset, littleEndian);
        case 'double': case 'float64': return dataView.getFloat64(offset, littleEndian);
        default: throw new Error("Unsupported PLY property type: " + type);
    }
}

/**
 * Parses the ASCII header portion of a PLY file (everything before "end_header") into its
 * format and a list of elements (e.g. "vertex", "face"), each with an ordered property list.
 * List-type properties (used for face vertex indices) are flagged with isList so the body
 * parser knows to read a count before its values instead of a fixed number of scalars.
 *
 * @param headerText The decoded text of the header, not including the "end_header" line itself.
 * @returns {{format: string, elements: Array}} The PLY format string and parsed element list.
 */
function parsePLYHeader(headerText) {
    const lines = headerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let format = 'ascii';
    const elements = [];
    let currentElement = null;

    for (const line of lines) {
        if (line.startsWith('comment') || line.startsWith('obj_info') || line === 'ply') continue;

        if (line.startsWith('format')) {
            format = line.split(/\s+/)[1];
        } else if (line.startsWith('element')) {
            const parts = line.split(/\s+/);
            currentElement = { name: parts[1], count: parseInt(parts[2]), properties: [] };
            elements.push(currentElement);
        } else if (line.startsWith('property') && currentElement) {
            const parts = line.split(/\s+/);
            if (parts[1] === 'list') {
                currentElement.properties.push({ name: parts[4], isList: true, listCountType: parts[2], listItemType: parts[3] });
            } else {
                currentElement.properties.push({ name: parts[2], isList: false, type: parts[1] });
            }
        }
    }
    return { format, elements };
}

/**
 * An asynchronous function for parsing ANY well-formed PLY model file -- Gaussian Splat point
 * clouds (the SAM 3D output this viewer was originally built for), plain point clouds, and
 * regular triangulated/polygonal meshes (e.g. exported from Blender or MeshLab).
 *
 * The header is parsed generically by property name rather than assuming a fixed byte layout,
 * so property order and the presence/absence of extra fields (normals, color, alpha, etc.) no
 * longer matter. The file is then classified by what it actually contains:
 *   - has a "face" element                                  -> regular mesh (positions/colors/indices)
 *   - vertex-only, with f_dc_0/opacity/scale_0/rot_0 fields  -> Gaussian Splat (SH color -> RGB)
 *   - vertex-only, anything else                             -> plain point cloud
 * A library was not used to perform this import because it was relatively simple to include
 * here, and such libraries are unnecessarily heavy for this purpose alone.
 *
 * @param url The file path for the PLY model to be parsed.
 * @returns {Promise<{kind: string, vertexCount: number, faceCount: (number|undefined), data: object}|null>}
 *          An async promise of the detected model kind ("mesh", "splat", or "points") and the
 *          data object ready to hand to buildMeshObject (for "mesh") or buildSplatObject (otherwise).
 */
// Clamps a color channel value into [0, max]; every color-conversion path below needs this
// (uchar mesh/point colors clamp to 255, float splat colors clamp to 1).
function clampChannel(value, max) {
    return Math.max(0, Math.min(max, value));
}

async function parsePLY(url) {
    console.log("Fetching PLY data from: " + url);
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // the header is always plain ASCII text, even in binary-format PLY files, so scan for it
    // with a growing search window in case of unusually large header/comment sections
    const textDecoder = new TextDecoder();
    let searchWindow = Math.min(bytes.length, 1024 * 64);
    let headerText = textDecoder.decode(bytes.subarray(0, searchWindow));
    let markerIdx = headerText.indexOf('end_header');
    while (markerIdx === -1 && searchWindow < bytes.length) {
        searchWindow = Math.min(bytes.length, searchWindow * 4);
        headerText = textDecoder.decode(bytes.subarray(0, searchWindow));
        markerIdx = headerText.indexOf('end_header');
    }
    if (markerIdx === -1) {
        console.error("Could not find end_header in PLY file.");
        return null;
    }

    // only strip the single line terminator right after "end_header" (either "\n" or "\r\n") --
    // looping here would risk eating into binary payload bytes that happen to equal \r or \n
    let headerEnd = markerIdx + 'end_header'.length;
    if (headerText[headerEnd] === '\r') headerEnd++;
    if (headerText[headerEnd] === '\n') headerEnd++;

    const { format, elements } = parsePLYHeader(headerText.slice(0, markerIdx));
    const littleEndian = format !== 'binary_big_endian';

    const vertexElement = elements.find(e => e.name === 'vertex');
    const faceElement = elements.find(e => e.name === 'face');

    if (!vertexElement) {
        console.error("PLY file has no vertex element.");
        return null;
    }

    const xIdx = vertexElement.properties.findIndex(p => p.name === 'x');
    const yIdx = vertexElement.properties.findIndex(p => p.name === 'y');
    const zIdx = vertexElement.properties.findIndex(p => p.name === 'z');
    if (xIdx === -1 || yIdx === -1 || zIdx === -1) {
        console.error("PLY vertex element is missing x/y/z position properties.");
        return null;
    }

    console.log("Successfully parsed header. Loading PLY data...");

    // classify the file from header metadata alone (property names), before touching any
    // per-vertex data, so the body parser below only has to store the properties this
    // classification actually needs -- large splat/point-cloud PLYs commonly declare dozens
    // of properties (full spherical harmonics, curvature, etc.) that would otherwise be
    // needlessly parsed and held in memory for every single vertex
    const propNames = new Set(vertexElement.properties.map(p => p.name));
    const hasFaces = !!faceElement && faceElement.count > 0;
    const isSplat = propNames.has('f_dc_0') && propNames.has('f_dc_1') && propNames.has('f_dc_2') &&
        propNames.has('opacity') && propNames.has('scale_0') && propNames.has('rot_0');
    const hasColorChannels = propNames.has('red') && propNames.has('green') && propNames.has('blue');
    const hasAlphaChannel = propNames.has('alpha');
    const colorProp = hasColorChannels ? vertexElement.properties.find(p => p.name === 'red') : null;
    // PLY colors are almost always stored as 0-255 uchar values; only scale down if they were
    // actually declared as a float type (0.0-1.0 range)
    const isFloatColor = colorProp && (colorProp.type === 'float' || colorProp.type === 'float32' || colorProp.type === 'double');

    const neededPropNames = new Set();
    if (isSplat) { neededPropNames.add('f_dc_0'); neededPropNames.add('f_dc_1'); neededPropNames.add('f_dc_2'); }
    if (hasColorChannels) {
        neededPropNames.add('red'); neededPropNames.add('green'); neededPropNames.add('blue');
        if (hasAlphaChannel) neededPropNames.add('alpha');
    }
    // x/y/z are handled separately straight into the positions array below, so they're excluded here
    const otherNeededProps = vertexElement.properties
        .map((p, propIdx) => ({ name: p.name, type: p.type, propIdx }))
        .filter(p => neededPropNames.has(p.name));

    const count = vertexElement.count;
    const positions = new Float32Array(count * 3);
    const vertexProps = {};
    otherNeededProps.forEach(p => { vertexProps[p.name] = new Float32Array(count); });
    const faceIndices = [];

    // if a face element has more than one list property, prefer the one conventionally used
    // for vertex indices by name, falling back to the first list found for unusual exporters
    const faceListProps = faceElement ? faceElement.properties.filter(p => p.isList) : [];
    const indexListProp = faceListProps.find(p => p.name === 'vertex_indices' || p.name === 'vertex_index') || faceListProps[0];

    if (format === 'ascii') {
        const bodyText = textDecoder.decode(bytes.subarray(headerEnd));
        const lines = bodyText.split('\n');
        let lineIdx = 0;

        for (let i = 0; i < count; i++) {
            if (lineIdx >= lines.length) {
                console.error("PLY file ended unexpectedly while reading vertex data.");
                return null;
            }
            const tokens = lines[lineIdx++].trim().split(/\s+/).map(Number);
            positions[i * 3 + 0] = tokens[xIdx];
            positions[i * 3 + 1] = tokens[yIdx];
            positions[i * 3 + 2] = tokens[zIdx];
            for (const p of otherNeededProps) {
                vertexProps[p.name][i] = tokens[p.propIdx];
            }
        }

        if (faceElement) {
            for (let i = 0; i < faceElement.count; i++) {
                if (lineIdx >= lines.length) {
                    console.error("PLY file ended unexpectedly while reading face data.");
                    return null;
                }
                const tokens = lines[lineIdx++].trim().split(/\s+/).map(Number);
                let tokenPos = 0;
                let idx = null;
                for (const prop of faceElement.properties) {
                    if (prop.isList) {
                        const n = tokens[tokenPos++];
                        const values = tokens.slice(tokenPos, tokenPos + n);
                        tokenPos += n;
                        if (prop === indexListProp) idx = values;
                    } else {
                        tokenPos++; // skip an unused per-face scalar (e.g. per-face color)
                    }
                }
                // fan-triangulate in case of quads/n-gons so it can be drawn with gl.TRIANGLES
                if (idx) {
                    for (let v = 1; v < idx.length - 1; v++) {
                        faceIndices.push(idx[0], idx[v], idx[v + 1]);
                    }
                }
            }
        }
    } else {
        const dataView = new DataView(buffer, headerEnd);
        let cursor = 0;

        // vertex elements only ever contain fixed-size scalar properties, so their stride is constant
        const stride = vertexElement.properties.reduce((sum, p) => sum + PLY_TYPE_SIZES[p.type], 0);
        const propOffsets = {};
        let running = 0;
        vertexElement.properties.forEach(p => { propOffsets[p.name] = running; running += PLY_TYPE_SIZES[p.type]; });

        const xType = vertexElement.properties[xIdx].type;
        const yType = vertexElement.properties[yIdx].type;
        const zType = vertexElement.properties[zIdx].type;
        const xOffset = propOffsets.x, yOffset = propOffsets.y, zOffset = propOffsets.z;

        for (let i = 0; i < count; i++) {
            const base = cursor + i * stride;
            positions[i * 3 + 0] = readPLYScalar(dataView, base + xOffset, xType, littleEndian);
            positions[i * 3 + 1] = readPLYScalar(dataView, base + yOffset, yType, littleEndian);
            positions[i * 3 + 2] = readPLYScalar(dataView, base + zOffset, zType, littleEndian);
            for (const p of otherNeededProps) {
                vertexProps[p.name][i] = readPLYScalar(dataView, base + propOffsets[p.name], p.type, littleEndian);
            }
        }
        cursor += count * stride;

        if (faceElement) {
            // face rows have variable length (an N-gon vertex count followed by N indices, plus
            // any other per-face properties), so they have to be walked one row at a time
            for (let i = 0; i < faceElement.count; i++) {
                let idx = null;
                for (const prop of faceElement.properties) {
                    if (prop.isList) {
                        const countSize = PLY_TYPE_SIZES[prop.listCountType];
                        const itemSize = PLY_TYPE_SIZES[prop.listItemType];
                        const n = readPLYScalar(dataView, cursor, prop.listCountType, littleEndian);
                        cursor += countSize;
                        const values = [];
                        for (let v = 0; v < n; v++) {
                            values.push(readPLYScalar(dataView, cursor, prop.listItemType, littleEndian));
                            cursor += itemSize;
                        }
                        if (prop === indexListProp) idx = values;
                    } else {
                        cursor += PLY_TYPE_SIZES[prop.type]; // skip an unused per-face scalar (e.g. per-face color)
                    }
                }
                // fan-triangulate in case of quads/n-gons so it can be drawn with gl.TRIANGLES
                if (idx) {
                    for (let v = 1; v < idx.length - 1; v++) {
                        faceIndices.push(idx[0], idx[v], idx[v + 1]);
                    }
                }
            }
        }
    }

    if (hasFaces) {
        console.log("Detected mesh PLY (" + count + " vertices, " + faceElement.count + " faces).");

        let colors = null;
        if (hasColorChannels) {
            colors = new Uint8Array(count * 4);
            const scale = isFloatColor ? 255 : 1;
            for (let i = 0; i < count; i++) {
                colors[i * 4 + 0] = Math.round(clampChannel(vertexProps.red[i] * scale, 255));
                colors[i * 4 + 1] = Math.round(clampChannel(vertexProps.green[i] * scale, 255));
                colors[i * 4 + 2] = Math.round(clampChannel(vertexProps.blue[i] * scale, 255));
                colors[i * 4 + 3] = hasAlphaChannel ? Math.round(clampChannel(vertexProps.alpha[i] * scale, 255)) : 255;
            }
        }

        const indices = new Uint32Array(faceIndices);
        return {
            kind: 'mesh',
            vertexCount: count,
            faceCount: faceElement.count,
            data: {
                positions, normals: null, uvs: null, colors, colorSize: 4,
                indices, indexType: gl.UNSIGNED_INT, indexCount: indices.length, image: null
            }
        };
    }

    const colors = new Float32Array(count * 4);
    if (isSplat) {
        console.log("Detected Gaussian Splat PLY (" + count + " splats).");
        // converting spherical harmonics DC term (used for Gaussian Splats) into RGB values
        const SH_C0 = 0.28209479177387814;
        for (let i = 0; i < count; i++) {
            colors[i * 4 + 0] = clampChannel(0.5 + SH_C0 * vertexProps.f_dc_0[i], 1);
            colors[i * 4 + 1] = clampChannel(0.5 + SH_C0 * vertexProps.f_dc_1[i], 1);
            colors[i * 4 + 2] = clampChannel(0.5 + SH_C0 * vertexProps.f_dc_2[i], 1);
            colors[i * 4 + 3] = 1.0;
        }
    } else {
        console.log("Detected point cloud PLY (" + count + " points, no splat/mesh data found).");
        for (let i = 0; i < count; i++) {
            if (hasColorChannels) {
                colors[i * 4 + 0] = isFloatColor ? vertexProps.red[i] : vertexProps.red[i] / 255;
                colors[i * 4 + 1] = isFloatColor ? vertexProps.green[i] : vertexProps.green[i] / 255;
                colors[i * 4 + 2] = isFloatColor ? vertexProps.blue[i] : vertexProps.blue[i] / 255;
            } else {
                colors[i * 4 + 0] = colors[i * 4 + 1] = colors[i * 4 + 2] = 1.0;
            }
            colors[i * 4 + 3] = 1.0;
        }
    }

    console.log("Finished getting instance data.");
    return { kind: isSplat ? 'splat' : 'points', vertexCount: count, data: { numInstances: count, positions, colors } };
}

/**
 * Reflects a boolean toggle state onto a button's CSS class so the UI shows whether a
 * feature (light, shadows, glass, etc.) is currently on, whether it was flipped from the
 * keyboard shortcut or by clicking the button itself.
 *
 * @param buttonId The id of the button element to update.
 * @param isOn Whether the toggle it represents is currently enabled.
 */
function syncToggleButton(buttonId, isOn) {
    const btn = document.getElementById(buttonId);
    if (btn) btn.classList.toggle("active", isOn);
}

// Describes each keyboard/button-driven feature toggle: which button it drives, and how to
// read/write the underlying state variable (plain booleans can't be passed by reference, so a
// getter/setter pair stands in for one). Shared by the keydown handler, the button click
// handlers, and the initial state sync so flip+sync bookkeeping only lives in one place.
const glassToggleDef = { buttonId: "glassToggleBtn", get: () => glassToggle, set: v => { glassToggle = v; } };
const lightToggleDef = { buttonId: "lightToggleBtn", get: () => lightToggle, set: v => { lightToggle = v; } };
const shadowToggleDef = { buttonId: "shadowToggleBtn", get: () => shadowToggle, set: v => { shadowToggle = v; } };
const diffuseToggleDef = { buttonId: "diffuseToggleBtn", get: () => diffuseToggle, set: v => { diffuseToggle = v; } };
const specularToggleDef = { buttonId: "specularToggleBtn", get: () => specularToggle, set: v => { specularToggle = v; } };
const allToggleDefs = [glassToggleDef, lightToggleDef, shadowToggleDef, diffuseToggleDef, specularToggleDef];

/**
 * Flips a feature toggle's underlying state and reflects the new value onto its button.
 * @param toggle One of the toggle descriptors above.
 */
function flipToggle(toggle) {
    toggle.set(!toggle.get());
    syncToggleButton(toggle.buttonId, toggle.get());
}

/**
 * Updates the mesh/splat view toggle button's label and active state to reflect meshToggle,
 * so the button always describes what clicking it will switch TO rather than a static label.
 */
function updateViewToggleLabel() {
    const btn = document.getElementById("viewToggleBtn");
    if (!btn) return;
    btn.textContent = meshToggle ? "Switch to Splat View" : "Switch to Mesh View";
    btn.classList.toggle("active", meshToggle);
}

/**
 * A helper function to push four points in an order that allows two triangles (making up
 * a square face) to be rendered later on.
 *
 * Each of the four vertex locations passed to this function will be called from an array of stored
 * vertices in order to pass the required points for two triangles to be rendered. The points are
 * pushed to another, separate array of points.
 *
 * @param a The first vertex location on the quad face.
 * @param b The second vertex location on the quad face.
 * @param c The third vertex location on the quad face.
 * @param d The fourth vertex location on the quad face.
 */
function quad(a, b, c, d){
    sbPoints.push(sbVertices[a]);
    sbPoints.push(sbVertices[b]);
    sbPoints.push(sbVertices[c]);
    sbPoints.push(sbVertices[a]);
    sbPoints.push(sbVertices[c]);
    sbPoints.push(sbVertices[d]);
}

/**
 * A helper function for creating a cube using the quad function to draw all
 * six faces.
 *
 * This function calls quad six times all with various combinations of vertex locations
 * to render a quad face for each different face of a cube. The locations given to quad are
 * representing the index of the vertices within another array.
 */
function cube(){
    quad(1, 0, 3, 2); // top face
    quad(2, 3, 7, 6); // right face
    quad(0, 4, 7, 3); // back face
    quad(5, 1, 2, 6); // front face
    quad(6, 7, 4, 5); // bottom face
    quad(5, 4, 0, 1); // left face
}

/**
 * A function for generating the geometry for the skybox.
 *
 * This function uses the cube function to generate a cube geometry for the skybox. This
 * shape is then pushed to a buffer to be rendered by the GPU.
 */
function makeSb(){
    cube(); // make vertices for skybox cube
    sbObject = gl.createVertexArray();
    gl.bindVertexArray(sbObject);

    var sbBuff = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sbBuff);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(sbPoints), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
}

/**
 * A function for generating a default texture of an object within the scene.
 *
 * The default texture generated by this function should be a 2x2 checkerboard, to be used when
 * an object is untextured or the default texture is willingly used.
 */
function defaultTex() {
    defaultMeshTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, defaultMeshTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // checkerboard as default
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

/**
 * A helper function for binding the custom skybox texture to a cube map.
 * This custom skybox texture is used when texturing the skybox in the graphics shader.
 */
function sbConfig() {
    sbCubeMap = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, sbCubeMap);

    // smoothing
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // find custom images downloaded from https://freestylized.com/skybox/sky_46/ I found for cool skybox
    const sbFaces = [
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: 'px.png' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: 'nx.png' },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: 'py.png' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: 'ny.png' },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: 'pz.png' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: 'nz.png' }
    ];

    // for each face bind the image as the texture on the cubeMap ( or a pixel before they load)
    sbFaces.forEach(face => {
        // making black pixel for side if image not loaded yet (without, webGL keeps crashing before image load)
        gl.texImage2D(face.target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))

        const image = new Image();
        image.src = face.url;
        image.onload = function () {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, sbCubeMap);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(face.target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        };
    });
}

function buildFloor() {
    floorObject = gl.createVertexArray();
    gl.bindVertexArray(floorObject);

    // floor is 10x10 plane
    var y = -1.0;
    var points = new Float32Array([
        -5.0, y, -5.0,
        -5.0, y,  5.0,
        5.0, y,  5.0,
        -5.0, y, -5.0,
        5.0, y,  5.0,
        5.0, y, -5.0
    ])
    // normals all face upward
    var normals = new Float32Array([
        0,1,0,
        0,1,0,
        0,1,0,
        0,1,0,
        0,1,0,
        0,1,0
    ])
    var uvs = new Float32Array([
        0,0,
        0,5,
        5,5,
        0,0,
        5,5,
        5,0
    ])
    var pointsBuff = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuff);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    var normalsBuff = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalsBuff);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    var uvsBuff = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvsBuff);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
}



/**
 * A helper function for pushing the data from the mesh file to data buffers for rendering.
 *
 * The data from the mesh is parsed somewhere else and passed to this function, which is then used to
 * push to the graphics buffer for rendering in the scene. A separate vertex object must be made here to separate
 * this data from the PLY splat geometry.
 *
 * @param meshData The data parsed from the mesh object file.
 */
function buildMeshObject(meshData){
    meshICount = meshData.indexCount;
    meshIType = meshData.indexType;
    meshVertexObj = gl.createVertexArray();
    gl.bindVertexArray(meshVertexObj);

    var meshBuff = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuff);
    gl.bufferData(gl.ARRAY_BUFFER, meshData.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    var indexBuff = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuff);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshData.indices, gl.STATIC_DRAW);

    if(meshData.normals){ // make sure normals are not null, if so do same thing
        var normalsBuff = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalsBuff);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    }
    if(meshData.uvs) { // make sure the uvs are not null, bind again
        var uvsBuff = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvsBuff);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, meshData.color, gl.FLOAT, false, 0, 0);
    }

    if(meshData.colors) { // bind colors
        var colorsBuff = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuff);
        gl.bufferData(gl.ARRAY_BUFFER, meshData.colors, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(3); // layout position 3 in MESH vertex shader
        // tried with floats and it didn't work, meshes must be getting generated as byte, and need to be normalized for shading
        gl.vertexAttribPointer(3, meshData.colorSize, gl.UNSIGNED_BYTE, true, 0, 0);
    }

    if (meshData.image) { // bind image texture if it exists ( these glbs use vertex colors)
        glbTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, glbTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, meshData.image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    gl.bindVertexArray(null);
}

/**
 * A helper function for pushing the data from the splat file to data buffers for rendering.
 *
 * The data from the splat is parsed somewhere else and passed to this function, which is then used to
 * push to the graphics buffer for rendering in the scene. A separate vertex object must be made here to separate
 * this data from the glb mesh geometry.
 *
 * @param meshData The data parsed from the PLY object file.
 */
function buildSplatObject(splatData){
    vertexObject = gl.createVertexArray();
    gl.bindVertexArray(vertexObject);

    // square at origin
    const quadVerts = new Float32Array([
        -1.0, -1.0, // bottom left
        1.0, -1.0, // bottom right
        -1.0, 1.0, // top left
        1.0, 1.0, // top right
    ]);

    var quadBuf = gl.createBuffer(); // buffer for base
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // update the number of instances based on parse
    numInstances = splatData.numInstances;

    // instance positions, push them to buffer
    var posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, splatData.positions, gl.STATIC_DRAW);
    const instancePosLoc = 1;
    gl.enableVertexAttribArray( instancePosLoc );
    gl.vertexAttribPointer(instancePosLoc, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(instancePosLoc, 1);

    // instance colors, push them to buffer
    var colBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, splatData.colors, gl.STATIC_DRAW);
    const instanceColLoc = 2;
    gl.enableVertexAttribArray( instanceColLoc );
    gl.vertexAttribPointer(instanceColLoc, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(instanceColLoc, 1);

    gl.bindVertexArray(null);
}

/**
 * A function that is used to buffer the data from a hat glb, primarily used for constructing
 * hats in the hierarchical model. A hat glb model can be referenced and replaced within this directory to
 * edit the model used. The build accounts for texture maps and color vectors.
 *
 * @param hatData The data parsed from the hat glb file using the GLB loader function.
 */
function buildHat (hatData) {
    hatICount = hatData.indexCount;
    hatIType = hatData.indexType;
    if (hatData.positions) hatVertexCount = hatData.positions.length / 3;

    hatObject = gl.createVertexArray();
    gl.bindVertexArray(hatObject);

    if (hatData.positions) {
        var posBuff = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuff);
        gl.bufferData(gl.ARRAY_BUFFER, hatData.positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    }

    if (hatData.indices) {
        var indexBuff = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuff);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, hatData.indices, gl.STATIC_DRAW);
    }

    if (hatData.normals) {
        var normalBuff = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuff);
        gl.bufferData(gl.ARRAY_BUFFER, hatData.normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    }

    if (hatData.uvs) {
        var uvsBuff = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvsBuff);
        gl.bufferData(gl.ARRAY_BUFFER, hatData.uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    }

    if (hatData.colors) { // check if the hat texture is built using color vectors
        var colorBuff = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuff);
        gl.bufferData(gl.ARRAY_BUFFER, hatData.colors, gl.STATIC_DRAW);

        let glType = gl.FLOAT;
        let normalize = false;
        if (hatData.colors instanceof Uint8Array) { glType = gl.UNSIGNED_BYTE; normalize = true; }
        else if (hatData.colors instanceof Uint16Array) { glType = gl.UNSIGNED_SHORT; normalize = true; }

        let cSize = hatData.colorSize || 4;
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, cSize, glType, normalize, 0, 0);
    }

    if (hatData.image) { // check if model has texture map and use that
        hatTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, hatTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hatData.image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    gl.bindVertexArray(null);

}

window.onload = async function init() {

    canvas = document.getElementById( "gl-canvas" );

    // Need WebGl 2.0 for rendering splats
    gl = canvas.getContext("webgl2");
    if ( !gl ) {
        alert( "WebGL 2.0 isn't available" );
        return;
    }

    gl.getExtension("EXT_color_buffer_float");

    // make viewport, background, and program
    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 1.0, 1.0, 1.0, 1.0 );
    gl.enable(gl.DEPTH_TEST);
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    lightingProgram = initShaders(gl, "relighting-vertex-shader", "relighting-fragment-shader");
    meshProgram = initShaders(gl, "mesh-vertex-shader", "mesh-fragment-shader");
    gl.useProgram(program);

    // load data from PLY file (mesh, Gaussian Splat, or plain point cloud -- auto-detected) and GLB file
    document.getElementById("plyUpload").addEventListener("change", async function (event) {
        const file = event.target.files[0];
        if(!file){ // check that file upload worked
            return;
        }
        const filePath = URL.createObjectURL(file); // make url to pass to parser
        const statusEl = document.getElementById("plyStatus");
        if (statusEl) statusEl.textContent = "Parsing " + file.name + "...";

        let parsed;
        try {
            parsed = await parsePLY(filePath);
        } catch (err) {
            console.error("Failed to parse PLY file:", err);
            if (statusEl) statusEl.textContent = "Failed to parse " + file.name + ": " + err.message;
            return;
        }
        if (!parsed) {
            if (statusEl) statusEl.textContent = "Failed to parse " + file.name + ". Check console for details.";
            return;
        }

        if (parsed.kind === 'mesh') {
            buildMeshObject(parsed.data);
            meshToggle = true; // switch to mesh view since that's what was just uploaded
            if (statusEl) statusEl.textContent = "Loaded mesh: " + parsed.vertexCount + " vertices, " + parsed.faceCount + " faces.";
        } else {
            buildSplatObject(parsed.data);
            meshToggle = false; // switch to splat view since that's what was just uploaded
            const label = parsed.kind === 'splat' ? "Gaussian Splat" : "point cloud";
            if (statusEl) statusEl.textContent = "Loaded " + label + ": " + parsed.vertexCount + " points.";
        }
        updateViewToggleLabel();
    })

    document.getElementById("meshUpload").addEventListener("change", async function (event) {
        const file = event.target.files[0];
        if(!file){ // check that file upload worked
            return;
        }
        const filePath = URL.createObjectURL(file); // make url to pass to parser
        const statusEl = document.getElementById("plyStatus");
        const meshData = await loadGLB(filePath);
        if (meshData){
            buildMeshObject(meshData);
            meshToggle = true; // switch to mesh view since that's what was just uploaded, matching the .ply upload behavior
            updateViewToggleLabel();
            if (statusEl) statusEl.textContent = "Loaded mesh: " + file.name + ".";
        }

    })

    document.getElementById("hatUpload").addEventListener("change", async function (event) {
        const file = event.target.files[0];
        if(!file){ // check that file upload worked
            return;
        }
        const filePath = URL.createObjectURL(file); // make url to pass to parser
        const hatData = await loadGLB(filePath);
        if (hatData){
            buildHat(hatData);
        }

    })



    // Event listeners for user key interactions
    window.addEventListener("keydown", function(event) {
        switch(event.key){
            case "w": case "W": // move cam forward
                camZ -= flySpeed;
                break;
            case "s": case "S": // move cam back
                camZ += flySpeed;
                break;
            case "a" : case "A": // move cam left
                camX -= flySpeed;
                break;
            case "d" : case "D": // move cam right
                camX += flySpeed;
                break;
            case "q" : case "Q": // move cam down
                camY -= flySpeed;
                break;
            case "e" : case "E": // move cam up
                camY += flySpeed;
                break;
            case "g": case "G": // turn glass on/off
                flipToggle(glassToggleDef);
                break;
            case "ArrowUp": // move model forward
                event.preventDefault();
                modelTranslationZ -= flySpeed;
                break;
            case "ArrowDown": // move model back
                event.preventDefault();
                modelTranslationZ += flySpeed;
                break;
            case "ArrowLeft": // move model left
                event.preventDefault();
                modelTranslationX -= flySpeed;
                break;
            case "ArrowRight": // move model right
                event.preventDefault();
                modelTranslationX += flySpeed;
                break;
            case "l": case "L": // turn spotlight on/off
                flipToggle(lightToggleDef);
                break;
            case "k": case "K": // turn shadows on/off
                flipToggle(shadowToggleDef);
                break;
            case "1":
                flipToggle(diffuseToggleDef);
                break;
            case "2":
                flipToggle(specularToggleDef);
                break;
        }
    })

    // Event listeners for user mouse interactions
    canvas.addEventListener("mousedown", function(e){
        dragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
    })

    canvas.addEventListener("mouseup", function(e){
        dragging = false;
    })

    // if mouse leaves canvas make it stop rotating
    canvas.addEventListener("mouseleave", function(e){
        dragging = false;
    })

    canvas.addEventListener("mousemove", function(e){
        if (dragging){
            var dX = e.clientX - prevMouseX; // find difference in mouse positions
            var dY = e.clientY - prevMouseY;

            // if shift key is pressed we can change direction of rotation
            if(e.shiftKey){
                modelRotationZ += dX * 0.5; // speed of rotation
            } else {
                modelRotationY += dX * 0.5;
                modelRotationX += dY * 0.5;
            }

            prevMouseX = e.clientX; // record this as preview location
            prevMouseY = e.clientY;
        }
    })

    document.getElementById("viewToggleBtn").addEventListener("click", function(e){
        meshToggle = !meshToggle;
        updateViewToggleLabel();
    })

    allToggleDefs.forEach(toggle => {
        document.getElementById(toggle.buttonId).addEventListener("click", function(e){
            flipToggle(toggle);
        });
    });

    // reflect the initial default states of all toggles onto their buttons
    allToggleDefs.forEach(toggle => syncToggleButton(toggle.buttonId, toggle.get()));
    updateViewToggleLabel();

    // UI sliders
    document.getElementById("spotSlider").oninput = function(e) {
        spotlightAngle = parseFloat(e.target.value);
        document.getElementById("spotSize").innerText = spotlightAngle;
        spotCutoff = Math.cos(spotlightAngle * Math.PI / 180.0);
    };

    document.getElementById("pointSizeSlider").oninput = function(e) {
        splatPointSize = parseFloat(e.target.value);
        document.getElementById("pointSizeValue").innerText = splatPointSize.toFixed(4);
    };

    document.getElementById("blurSlider").oninput = function(e) {
        bilatBlurWidth = parseFloat(e.target.value);
        document.getElementById("blurWidth").innerText = bilatBlurWidth.toFixed(1);
    };

    document.getElementById("sharpnessSlider").oninput = function(e) {
        bilatBlurSharpness = parseFloat(e.target.value);
        document.getElementById("blurSharpness").innerText = bilatBlurSharpness.toFixed(2);
    };

    document.getElementById("splatBrightSlider").oninput = function(e) {
        splatAmbientBrightness = parseFloat(e.target.value);
        document.getElementById("splatBrightness").innerText = splatAmbientBrightness.toFixed(2);
    };

    document.getElementById("hatToggle").addEventListener("click", function(e){
        hatCount++;
    });

    setupFramebuffer(); // pass 1
    setupRelightingProgram(); // pass 2
    colorTexLoc = gl.getUniformLocation(lightingProgram, "uColorTex");
    posTexLoc = gl.getUniformLocation(lightingProgram, "uPosTex");

    makeSb(); // build the skybox object
    buildFloor(); // build the floor geometry
    defaultTex(); // bind a default texture
    sbConfig(); // bind the images for the skybox

    gl.useProgram(meshProgram); // connect textures to mesh program

    // mesh lighting setup
    gl.uniform4fv(gl.getUniformLocation(meshProgram, "lightDiffuse"), flatten(lightDiffuse));
    gl.uniform4fv(gl.getUniformLocation(meshProgram, "materialDiffuse"), flatten(materialDiffuse));
    gl.uniform4fv(gl.getUniformLocation(meshProgram, "lightSpecular"), flatten(lightSpecular));
    gl.uniform4fv(gl.getUniformLocation(meshProgram, "materialSpecular"), flatten(materialSpecular));
    gl.uniform4fv(gl.getUniformLocation(meshProgram, "lightAmbient"), flatten(lightAmbient));
    gl.uniform4fv(gl.getUniformLocation(meshProgram, "materialAmbient"), flatten(materialAmbient));
    gl.uniform1f(gl.getUniformLocation(meshProgram, "shininess"), materialShininess);
    gl.uniform1f(gl.getUniformLocation(meshProgram, "dropoff"), spotDropoff);

    gl.uniform1i(gl.getUniformLocation(meshProgram, "tex1"), 0);
    gl.uniform1i(gl.getUniformLocation(meshProgram, "texMap"), 1);

    render();
}

/**
 *
 */
function setupFramebuffer(){
    // need to make a frame buffer of textures according to Andrew Chan Gaussian Splat re-lighting technique paper
    // this will essentially make a frame off-screen to then compute lighting on
    // this is similar to how video game graphics engines work it seems
    gBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer);

    // need to store splat colors to a texture with RGB
    colorTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);

    // need to store positions to a texture within frame
    posTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, posTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, canvas.width, canvas.height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, posTexture, 0);

    // need to store depth for depth-testing on model
    depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, canvas.width, canvas.height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    // we need to render pos and color at the same time
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    // check if frame was correctly drawn
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Frame build failed")
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // return to screen rendering
}

/**
 *
 */
function setupRelightingProgram(){
    // make background quad for second pass of frame for lighting
    screenBackground = gl.createVertexArray();
    gl.bindVertexArray(screenBackground);
    var backgroundBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, backgroundBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray( 0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
}


function render() {
    // position camera and perspective according to user
    // both the objects (mesh and splat) need to maintain the same orientation, so
    // the math for orientation stays outside toggle check
    var eye = vec3(camX, camY, camZ);
    var at = vec3(camX, camY, 0.0); // must always look forward
    var up = vec3(0.0, 1.0, 0.0);
    var cameraMatrix = lookAt(eye, at, up);
    var modelMatrix = mat4();

    // allow rotation of splat model from the mouse movement, see event listeners
    modelMatrix = mult(modelMatrix, translate(modelTranslationX, 0, 0));
    modelMatrix = mult(modelMatrix, translate(0, modelTranslationY, 0));
    modelMatrix = mult(modelMatrix, translate(0, 0, modelTranslationZ));
    modelMatrix = mult(modelMatrix, rotateX(modelRotationX));
    modelMatrix = mult(modelMatrix, rotateY(modelRotationY));
    modelMatrix = mult(modelMatrix, rotateZ(modelRotationZ));


    var fovy = 45.0;
    var aspect = canvas.width / canvas.height;
    var near = 0.1;
    var far = 100.0;
    var projectionMatrix = perspective(fovy, aspect, near, far);

    // check toggle for mesh or splat object
    if (meshToggle){
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0.0, 0.0, 0.0, 0.0); // background stays same color between toggles for continuity
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(meshProgram); // enable mesh shaders
        var normalMV = mult(cameraMatrix, modelMatrix);

        // push matrices for projection
        projectionMatrixLoc = gl.getUniformLocation(meshProgram, "projectionMatrix");
        gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

        // put light relative to camera coords, then subtract from target to get light on model
        var lightView = mult(cameraMatrix, lightPosition);
        gl.uniform4fv(gl.getUniformLocation(meshProgram, "lightPosition"), flatten(lightView));
        var lightTarget = mult(cameraMatrix, vec4(0.0, 0.0, 0.0, 1.0));
        var targetedSpotDir = vec3(
            lightTarget[0] - lightView[0],
            lightTarget[1] - lightView[1],
            lightTarget[2] - lightView[2]
        );
        gl.uniform3fv(gl.getUniformLocation(meshProgram, "spotDirection"), flatten(targetedSpotDir));


        // skybox rendering
        gl.uniform1i(gl.getUniformLocation(meshProgram, "isSkybox"), 1); // tell shader that skybox is enabled
        gl.uniform1i(gl.getUniformLocation(meshProgram, "shadowEnabled"), 0); // is not shadow or glass
        gl.uniform1i(gl.getUniformLocation(meshProgram, "glassEnabled"), 0);

        // bind texture for skybox
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, sbCubeMap);

        var skyboxMatrix = scalem(50.0, 50.0, 50.0); // scale around scene
        gl.uniformMatrix4fv(gl.getUniformLocation(meshProgram, "modelMatrix"), false, flatten(skyboxMatrix));
        modelViewMatrixLoc = gl.getUniformLocation(meshProgram, "modelViewMatrix");
        gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(cameraMatrix));

        gl.bindVertexArray(sbObject);
        gl.disable(gl.DEPTH_TEST); // keeps skybox behind everything, makes it as if everything is in front
        gl.drawArrays(gl.TRIANGLES, 0, 36);
        gl.enable(gl.DEPTH_TEST);

        // floor + default texture
        gl.uniform1i(gl.getUniformLocation(meshProgram, "isSkybox"), 0);
        gl.uniform1i(gl.getUniformLocation(meshProgram, "lightEnabled"), lightToggle ? 1 : 0); // need light off before rendering floor
        gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(cameraMatrix));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, defaultMeshTex);
        gl.bindVertexArray(floorObject);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // shadows
        if (lightToggle && shadowToggle && diffuseToggle && meshVertexObj) { // shadows only show up if light is on and mesh is uploaded
            gl.uniform1i(gl.getUniformLocation(meshProgram, "shadowEnabled"), 1); // tell shader this is shadow
            var shadowProj = mat4();
            shadowProj[3][3] = 0.0;
            shadowProj[3][1] = -1.0 / (lightPosition[1] - (-0.99));
            var firstTrans = translate(lightPosition[0], lightPosition[1], lightPosition[2]);
            var secondTrans = translate(lightPosition[0], -lightPosition[1], -lightPosition[2]);
            var flattenMatrix = mult(firstTrans, mult(shadowProj, secondTrans));
            var shadowMV = mult(cameraMatrix, mult(flattenMatrix, modelMatrix));
            gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(shadowMV));

            gl.enable(gl.BLEND); // allows for the shadow to not just be total black
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            // to draw shadow, we just take mesh and draw it flat
            if (meshICount > 0) {
                gl.bindVertexArray(meshVertexObj);
                gl.drawElements(gl.TRIANGLES, meshICount, meshIType, 0);
            }
            gl.disable(gl.BLEND);
        }


        // actual mesh rendering
        gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(normalMV));
        // push all conditionals for env
        gl.uniform1i(gl.getUniformLocation(meshProgram, "isSkybox"), 0); // tell shader this is no longer skybox
        gl.uniform1i(gl.getUniformLocation(meshProgram, "glassEnabled"), glassToggle ? 1 : 0); // indicate glass on or off
        gl.uniform1i(gl.getUniformLocation(meshProgram, "shadowEnabled"), 0);
        gl.uniform1i(gl.getUniformLocation(meshProgram, "diffuseEnabled"), diffuseToggle ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(meshProgram, "specularEnabled"), specularToggle ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(meshProgram, "cutoff"), spotCutoff);

        gl.activeTexture(gl.TEXTURE0); // activate mesh texture if there is one
        if (glbTexture) { // if texture is from glb, use it, if not use default texture
            gl.bindTexture(gl.TEXTURE_2D, glbTexture);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, defaultMeshTex);
        }

        if(meshVertexObj) { // only render if mesh has been uploaded
            // draw mesh objects
            if (meshICount > 0) {
                gl.bindVertexArray(meshVertexObj);
                gl.drawElements(gl.TRIANGLES, meshICount, meshIType, 0);
            }
        }

        // hierarchical hat generation
        if (hatCount > 0 && hatObject) {
            gl.bindVertexArray(hatObject);
            gl.uniform1i(gl.getUniformLocation(meshProgram, "glassEnabled"), 0); // hat shouldn't be made of glass

            // check if the hat has a texture and if so bind it, if not bind default
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, hatTexture ? hatTexture : defaultMeshTex);

            var parentMatrix = modelMatrix;
            for (var i = 0; i < hatCount; i++){
                // if this is the first hat we offset by a lot, if not offset by a little
                let yChange = (i === 0) ? 0.4 : 7.0;
                let scaleAmt = (i === 0) ? 0.02 : 1.0;

                // use parent matrix for position
                var hatMatrix = mult(parentMatrix, translate(-0.08, yChange, 0.0)); // for tweaking position
                hatMatrix = mult(hatMatrix, scalem(scaleAmt, scaleAmt, scaleAmt)); // for tweakng size
                var hatMV = mult(cameraMatrix, hatMatrix);
                gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(hatMV));

                if (hatICount > 0) {
                    gl.drawElements(gl.TRIANGLES, hatICount, hatIType, 0);
                } else if (hatVertexCount > 0) {
                    gl.drawArrays(gl.TRIANGLES, 0, hatVertexCount);
                }

                parentMatrix = hatMatrix; // update the parent matrix to be this one
            }
        }

    } else {
        // following Andrew Chan's two-pass rendering
        // Pass 1 - render to frame buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer); // take hold of frame buffer
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program);

        // view of splat on import is of the top, so rotating 90 degrees first will put it correctly
        // in view on import
        var modelViewMatrix = mult(cameraMatrix, modelMatrix);
        modelViewMatrix = mult(modelViewMatrix, rotateX(-90));

        // push matrices for camera and projection
        modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
        projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
        gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
        gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));
        gl.uniform1f(gl.getUniformLocation(program, "pointSize"), splatPointSize);

        // draw shapes
        gl.bindVertexArray(vertexObject);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, numInstances);

        // Pass 2 - render frame to screen & apply re-lighting
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // go back to screen buffer

        // need to clear canvas again
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // enable lighting shaders
        gl.useProgram(lightingProgram);

        // use position and color textures from first pass
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, colorTexture);
        gl.uniform1i(colorTexLoc, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, posTexture);
        gl.uniform1i(posTexLoc, 1);

        // pushing bilateral filter variables + relighting vars
        gl.uniform1f(gl.getUniformLocation(lightingProgram, "wide_coef"), bilatBlurWidth);
        gl.uniform1f(gl.getUniformLocation(lightingProgram, "sharpness_coef"), bilatBlurSharpness);
        gl.uniform1f(gl.getUniformLocation(lightingProgram, "ambientBrightness"), splatAmbientBrightness);

        if (vertexObject) { // only render if splat has been uploaded
            // draw the screen background
            gl.bindVertexArray(screenBackground);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }

    // request next frame
    requestAnimationFrame(render);
}
