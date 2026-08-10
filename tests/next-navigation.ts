export function notFound(): never {
  throw new Error("NEXT_NOT_FOUND");
}

export function redirect(url: string): never {
  throw new Error(`NEXT_REDIRECT:${url}`);
}
