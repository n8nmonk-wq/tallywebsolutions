"use client";

import { useEffect } from "react";

// Reveals .reveal elements once as they scroll in, staggering siblings; also watches content added later
// (client navigations, filter changes), so nothing stays hidden.
export default function Reveal() {
  useEffect(() => {
    const stagger = (el: HTMLElement) => {
      if (el.style.getPropertyValue("--i") || !el.parentElement) return;
      const index = [...el.parentElement.children].filter((c) => c.classList.contains("reveal")).indexOf(el);
      el.style.setProperty("--i", String(Math.min(Math.max(index, 0), 4)));
    };
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(".reveal").forEach((el) => el.setAttribute("data-in", ""));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.setAttribute("data-in", ""); io.unobserve(entry.target); }
    }, { threshold: 0.01, rootMargin: "0px 0px 10% 0px" });
    const watch = (root: ParentNode) => root.querySelectorAll<HTMLElement>(".reveal:not([data-in])").forEach((el) => { stagger(el); io.observe(el); });
    // Start once the browser is idle, so streamed sections finish hydrating before their attributes change.
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 120));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => watch(document));
    const mo = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(".reveal:not([data-in])")) { stagger(node); io.observe(node); }
        watch(node);
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { cancelIdle(handle); io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}
