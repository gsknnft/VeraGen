import Image from "next/image";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import "./landing.css";

export default function Home() {
  return <main className="landing">
    <header className="landing-nav"><Brand /><nav aria-label="Main navigation"><a href="#workflow">The workflow</a><Link className="nav-cta" href="/studio">Open studio ↗</Link></nav></header>
    <section className="landing-hero" aria-labelledby="hero-title">
      <Image className="hero-art" src="/brand/motion-frames-v1.webp" alt="Glass film frames carrying a flowing ribbon of amber light" fill priority sizes="100vw" />
      <div className="hero-shade" />
      <div className="hero-copy"><p className="eyebrow">● &nbsp; AN INDEPENDENT VIDEO STUDIO</p><h1 id="hero-title">Your idea.<br />Its next <em>frame.</em></h1><p className="hero-description">Generate the shot. Find the rhythm.<br />Make a video that feels like you.</p><div className="hero-actions"><Link className="action-primary" href="/studio">Start creating ↗</Link><a href="#workflow">Explore the studio ↓</a></div><p className="hero-note">An early creative tool. Built for the whole edit.</p></div>
      <div className="hero-caption"><span>01 — THE POSSIBILITIES BETWEEN FRAMES</span><span>VERAGEN / IDEAS INTO MOTION</span></div>
    </section>
    <div className="capability-strip"><span>Prompt to clip</span><span>Character references</span><span>Timeline editing</span><span>Captions & brand kits</span><span>Three export formats</span></div>
    <section id="workflow" className="workflow-section"><div><p className="eyebrow">FROM FIRST THOUGHT TO FINAL CUT</p><h2>Stay in the<br /><em>creative part.</em></h2><p className="section-description">One place to shape your shots, bring them together, and give the finished piece your signature.</p></div><div className="workflow-steps">{[
      ["01", "Find your shot.", "Start with a prompt or a character reference. Set a shared style for your project."],
      ["02", "Give it rhythm.", "Arrange your clips, trim the moment, and choose where to cut or crossfade."],
      ["03", "Make it yours.", "Add captions, your logo, and a closing message. Export portrait, square, or widescreen."],
    ].map(([number, title, description]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div></section>
    <section className="landing-close"><p className="eyebrow">THE NEXT FRAME IS YOURS</p><h2>Ideas into <em>motion.</em></h2><Link className="action-primary" href="/studio">Enter the studio ↗</Link><p>Generation availability depends on this installation.<br />Demo mode uses placeholder clips.</p></section>
    <footer className="landing-footer"><Brand /><span>Generate. Edit. Make it yours.</span><Link href="/studio">Open studio ↗</Link></footer>
  </main>;
}
