import type { AnchorHTMLAttributes, ReactNode } from "react";

export default function NextLink({
  children,
  href,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) {
  return (
    <a href={href} {...anchorProps}>
      {children}
    </a>
  );
}
