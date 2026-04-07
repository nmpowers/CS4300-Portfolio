import * as React from "react";
import {Github, Code2, MonitorPlay, LoaderPinwheel, Youtube} from "lucide-react";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Badge } from "./components/ui/badge";
import normandiePainting from "../assets/Normandie-Wall-Decor.jpg";
import a2Thumb from "../assets/A2-thumbnail.png";
import a3Thumb from "../assets/A3-thumbnail.png"
import a3cells from "../assets/A3-media1.jpg";

const A3 = {
  id: "a3",
  title: "A3: Assignmnet 2 - WebGPU Intro",
  summary: "An application of cellular noise and webcam input to exemplify a fractured version of your reflection.",
  description: "In this assignment, I applied simplex noise and a pseudo-random function to animate input from a user's webcam into " +
      "a fractured set of repeated reflections, which shifts as time goes on. The aesthetic of this assignment is somewhat organic, with the cell-like shapes that shift and react to the user's mouse, " +
      "which is meant to evoke a feeling of fractured identity amongst the user. There is a pane of parameters featured in the top right corner of the shader that can tweak the speed of the noise, the amount of reaction the mouse will get from " +
      "the cells (the force of the mouse), the amount of webcam warping inside each cell, and the size of the cell grid on the screen.\n\n" +
      "The shader applies a cellular grid using smooth steps to emulate an almost liquid combination of the cells, and then applies a simplex noise by Ian McEwan, Ashima Arts in combination with a random function to shift the cells " +
      "around the scene in some random way. The coordinate of the mouse is registered as a vertex to be \"avoided\" by other cells, and the other cells therefore react as to avoid the location of the mouse.\n\n" +
      "Feedback: ...",
  coverImage: a3Thumb,
  media: [{
    type: "image",
    url: a3cells,
  },],
  tech: ["WebGPU", "WGSL", "gulls.js", "Video Integration"],
  repoUrl: "https://github.com/nmpowers/CS4300-Portfolio/tree/main/public/webGPU-Intro",
  demoUrl: "/webGPU-Intro/index.html",
  videoURL: "#",
};

const A2 = {
  id: "a2",
  title: "A2: Assignment 1 - Shader Live Coding",
  summary:
    "An exploration of WGSL functions used to generate an expressive live coding experience following a specified aesthetic.",
  description:
    "Within this assignment I intended to explore themes of what is known as Urban Anonymity, Isolation, and Freedom of Expression. The aesthetic for the piece was inspired by a painting that hangs in my grandmother's house called \"Normandie\" by Frances Butler, featuring a lonesome steamboat. The black lines in the beginning of the piece" +
      " are simple and move with reaction to the user. \n\n The user or subject, in this case, is a sphere of passion represented with a saturated variation of colors that shift given the time. Eventually, " +
      "the black waves in the background become \"alive\", and increasingly complex. At this point, we begin to explore how the passions of the individual become both more complex and more polarized from their surroundings as time goes on. The user is both constructed by their environment, while remaining wholly different from it. " +
      "\n\nEventually, and finally, we explore the growth of passion from an individual as time goes on, which may both defy and consume their surroundings in what some would call drowning and others may call liberating. The entire scene is then overwhelmed by this colorful passion, and we view the world through the distortion of the user's sphere, which continues to fold in on itself more and more.\n\n" +
      "I felt slightly limited in my creation of this piece, just due to the coding environment being slightly new, but I believe that my aesthetic was expressed as intended nonetheless and given the time I had to create. I wanted to explore the combination of patters over time that may generate constructive new patterns in a chaotic and unpredictable way." +
      "\n\nFeedback: After showing this piece to Cole Bennett, he remarked that it evoked a feeling of creativity amongst what seems to be \" other boring elements\" , referring to the black lines opposing the colorful circle. This is close to the aesthetic I was going for as mentioned above, but not as in detail as I imagined. Additionally, he was interested in how I made the lines distort around the mouse, which is a technique I had picked up from my previous computer graphics course.",
  coverImage:
    a2Thumb,
  media: [
    {
      type: "image",
      url: normandiePainting,
    },
  ],
  tech: ["Live Coding", "WGSL", "Isolation", "Normandie"],
  repoUrl: "https://charlieroberts.codeberg.page/TheSchwartz/?Ly8gUFJFU1MgQ1RSTCtFTlRFUiBUTyBSRUxPQUQgU0hBREVSCi8vIHJlZmVyZW5jZSBhdCBodHRwczovL2NvZGViZXJnLm9yZy9jaGFybGllcm9iZXJ0cy9UaGVTY2h3YXJ0eiNyZWZlcmVuY2UKLy8gZm9yIHdnc2wgcmVmZXJlbmNlIHNlZSBodHRwczovL3dlYmdwdS5yb2Nrcy93Z3NsL2Z1bmN0aW9ucy9udW1lcmljLwpAZnJhZ21lbnQgCmZuIGZzKCBAYnVpbHRpbihwb3NpdGlvbikgcG9zIDogdmVjNGYgKSAtPiBAbG9jYXRpb24oMCkgdmVjNGYgeyAKCS8vIGdldCBub3JtYWxpemVkIHRleHR1cmUgY29vcmRpbmF0ZXMgKGFrYSB1dikgaW4gcmFuZ2UgMC0xIAoJdmFyIG5wb3MgPSB1dk4oIHBvcy54eSApOyBsZXQgZGlzdCA9IGxlbmd0aChtb3VzZS54eSAtIG5wb3MpOyAKCWxldCBzcG90ID0gMC4xNSAqIHNlY29uZHMoKS8yMDsgCgoJbGV0IHcgPSBzbW9vdGhzdGVwKHNwb3QsIDAuMCwgZGlzdCkgKiAuNjsgCgoJbGV0IG1wb3MgPSBucG9zIC0gKChtb3VzZS54eSAtIG5wb3MpICogdyogc2Vjb25kcygpKTsgCglsZXQgY3BvcyA9IHZlYzJmKDEuMCkgLSBtcG9zOyAKCWxldCByID0gbGVuZ3RoKGNwb3MpICogMi4wOyAKCglsZXQgYSA9IGF0YW4yKGNwb3MueCwgY3Bvcy55KTsgLy8gYm91bmRhcnkgCgl2YXIgZiA9IGFicyhjb3MoYSogMi4wKiBzZWNvbmRzKCkpKSAqIDAuNSArIDAuMzsgCglsZXQgc2hhcGVkID0gciAtIGYgKiBzaW4oc2Vjb25kcygpIC8gMi4wKTsgCgl2YXIgY29sb3IgPSB2ZWMzZihzdGVwKGZyYWN0KGFicyhzaGFwZWQpICogNS4pLCAwLjMpKTsgCgoJaWYoIGRpc3QgPCBzcG90ICkgeyAKCQlsZXQgciA9IGNvcyhzZWNvbmRzKCkpICogMC41ICsgLjU7IAoJCWxldCBnID0gYXNpbihzZWNvbmRzKCkgKyAyLjApICogMC41ICsgMC41OyAKCQlsZXQgYiA9IHNpbihzZWNvbmRzKCkgKyA0LjApICogMC43ICsgMC41OyAKCQljb2xvciA9IGNvbG9yICogdmVjM2YociwgZywgYik7IAoJfSAKCXJldHVybiB2ZWM0Zihjb2xvciwgMS4wKTsgCgp9",
  videoUrl: "https://youtu.be/HeMhPB_4Tcw",
};

export default function App() {
  const projects = [A2, A3];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <LoaderPinwheel className="w-5 h-5 text-purple-500" />
            <span>Nathaniel Powers | CS 4300</span>
          </div>
          <nav>
            <Button variant="ghost" asChild>
              <a
                href="#projects"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Projects
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative py-20 md:py-32 overflow-hidden bg-white">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          <div className="container mx-auto px-4 relative">
            <div className="max-w-2xl mx-auto text-center">
              <Badge
                variant="secondary"
                className="mb-6 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
              >
                CS 4300 Portfolio
              </Badge>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-6">
                Graphics, Simulation, <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-black to-purple-500">
                  and Aesthetics
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-600 mb-8 leading-relaxed">
                Welcome to my CS 4300 Course Portfolio Thing! This website serves as a public
                showcase for my assignments for CS 4300. Information on projects can be found below.
              </p>
              <div className="flex justify-center gap-4">
                <Button size="lg" className="rounded-full shadow-sm" asChild>
                  <a href="#projects">View Projects</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Project stuff */}
        <section id="projects" className="py-20 md:py-24">
          <div className="container mx-auto px-4">
            <div className="mb-12 md:mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Projects & Assignments
              </h2>
              <p className="mt-4 text-slate-600 text-lg max-w-2xl">
                Stuff from D-term 2026
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {projects.map((project) => (
                <Dialog key={project.id}>
                  <DialogTrigger asChild>
                    <div className="group h-full">
                      <Card className="flex flex-col h-full overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-indigo-200 hover:-translate-y-1 cursor-pointer bg-white">
                        <div className="aspect-video w-full overflow-hidden bg-slate-100">
                          <img
                            src={project.coverImage}
                            alt={project.title}
                            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                        <CardHeader>
                          <CardTitle className="text-xl group-hover:text-indigo-600 transition-colors">
                            {project.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow">
                          <CardDescription className="text-sm text-slate-600 line-clamp-3">
                            {project.summary}
                          </CardDescription>
                        </CardContent>
                        <CardFooter className="pt-4 border-t border-slate-100 mt-auto flex-wrap gap-2">
                          {project.tech.map((tech) => (
                            <Badge
                              key={tech}
                              variant="secondary"
                              className="bg-slate-100 text-slate-600 font-medium text-xs"
                            >
                              {tech}
                            </Badge>
                          ))}
                        </CardFooter>
                      </Card>
                    </div>
                  </DialogTrigger>

                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-bold text-slate-900">
                        {project.title}
                      </DialogTitle>
                      <DialogDescription className="text-base mt-2">
                        {project.summary}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="mt-6 space-y-8">
                      <div className="grid grid-cols-1 gap-4 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                        <img
                          src={project.coverImage}
                          alt={`${project.title} main screenshot`}
                          className="w-full object-cover max-h-[400px]"
                        />
                        {project.media.map((item, idx) => (
                          <img
                            key={idx}
                            src={item.url}
                            alt={`${project.title} additional screenshot ${
                              idx + 1
                            }`}
                            className="w-full object-cover max-h-[400px]"
                          />
                        ))}
                      </div>

                      <div>
                        <h4 className="text-lg font-semibold text-slate-900 mb-3">
                          About the Project
                        </h4>
                        <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {project.description}
                        </p>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3">
                          Technologies Used
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {project.tech.map((tech) => (
                            <Badge
                              key={tech}
                              variant="outline"
                              className="text-slate-700 border-slate-300"
                            >
                              {tech}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-100 flex flex-wrap gap-4">
                        <Button className="gap-2" asChild>
                          <a
                            href={project.repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Github className="w-4 h-4" />
                            View Source Code
                          </a>
                        </Button>
                        {project.videoUrl && (
                            <Button variant="outline" className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" asChild>
                              <a
                                  href={project.videoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                              >
                                <Youtube className="w-4 h-4" />
                                Watch Video Demo
                              </a>
                            </Button>
                        )}
                        {project.demoUrl && (
                            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white" asChild>
                              <a
                                  href={project.demoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                              >
                                <MonitorPlay className="w-4 h-4" />
                                Open Live Demo
                              </a>
                            </Button>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t py-12 text-center">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-2 mb-4 text-slate-400">
            <Code2 className="w-5 h-5" />
          </div>
          <p className="text-slate-500 text-sm">
            Created for CS 4300: Graphics, Simulation, and Aesthetics.
          </p>
          <p className="text-slate-400 text-xs mt-2">
            © {new Date().getFullYear()} Nathaniel Powers, WPI Class of 2026. All Rights Unreserved, do whatever with my code.
          </p>
        </div>
      </footer>
    </div>
  );
}
