"use client";

// The one piece of interactivity on an otherwise static page. `location.href` rather than a prop —
// the server doesn't know its own public origin reliably (preview URLs, custom domains), and the
// browser always does.

import { useState } from "react";

export function ShareButton(){
  const [copied, setCopied] = useState(false);

  async function copy(){
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS in dev); the link is already in the
      // address bar, so there's nothing more useful to do than leave the button as it was.
    }
  }

  return (
    <button className="link-btn" onClick={copy}>
      {copied ? "✓ Copied" : "🔗 Copy link"}
    </button>
  );
}
