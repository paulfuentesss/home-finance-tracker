"use client";

import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

/**
 * One group of "How it works" questions (the page has one per group). Links like
 * /how-it-works#points (from the Split Table's explainer cards) open that question, instead of
 * scrolling to it folded shut; each group opens only its own questions.
 */
export function FaqAccordion({ items }: { items: { id: string; q: string; a: React.ReactNode }[] }) {
  const [open, setOpen] = useState<string[]>([]);

  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!items.some((item) => item.id === id)) return;
      setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]));
      // Scroll after the answer has expanded so the question lands at the top.
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [items]);

  return (
    <Accordion multiple value={open} onValueChange={(value) => setOpen(value as string[])}>
      {items.map((faq) => (
        <AccordionItem key={faq.id} value={faq.id} id={faq.id} className="scroll-mt-6">
          <AccordionTrigger className="text-base hover:no-underline">{faq.q}</AccordionTrigger>
          <AccordionContent className="space-y-2 text-muted-foreground">{faq.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
