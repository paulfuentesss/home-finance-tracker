import type { Metadata } from "next";
import Link from "next/link";
import { MessagePage } from "@/components/message-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <MessagePage title="Page not found">
      <p className="text-sm text-muted-foreground">That month or page doesn&apos;t exist.</p>
      <Link href="/" className={buttonVariants({ className: "w-full" })}>
        Go to the latest month
      </Link>
    </MessagePage>
  );
}
