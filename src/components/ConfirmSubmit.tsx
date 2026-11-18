"use client";

import type { ComponentProps } from "react";

// A submit button that asks first, for permanent actions inside plain (non-JS) forms.
export default function ConfirmSubmit({ message, ...props }: ComponentProps<"button"> & { message: string }) {
  return <button type="submit" {...props} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }} />;
}
