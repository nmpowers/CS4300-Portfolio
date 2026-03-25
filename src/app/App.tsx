import * as React from "react";
import { Github, Code2, MonitorPlay } from "lucide-react";
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

// Dummy project
const DUMMY_PROJECT = {
  id: "ex-1",
  title: "Silly stuff Project",
  summary:
    "Something interesting about Graphics, Simulation, and/or Aesthetics I presume.",
  description:
    "This is one of the projects of all time.",
  coverImage:
    "#",
  media: [
    {
      type: "image",
      url: "#",
    },
  ],
  tech: ["A cool tool", "WebGL Probably"],
  repoUrl: "#",
};

export default function App() {
  const projects = [DUMMY_PROJECT];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <MonitorPlay className="w-5 h-5 text-indigo-600" />
            <span>Student Portfolio</span>
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
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-cyan-500">
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
