/**
 * DOM-to-Markdown converter designed to run inside page.evaluate().
 * This function must be self-contained (no imports) since it executes in the browser context.
 */
export function htmlToMarkdownBrowserFn(): (selector: string) => string {
  return (selector: string): string => {
    const root = document.querySelector(selector);
    if (!root) return "";

    function processNode(node: Node): string {
      // Text node
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || "";
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      // Skip "Copy" buttons inside code blocks
      if (tag === "button") return "";

      // Code blocks (<pre> containing <code>)
      if (tag === "pre") {
        const codeEl = el.querySelector("code");
        let lang = "";
        if (codeEl) {
          const classes = codeEl.className.split(/\s+/);
          for (const cls of classes) {
            const match = cls.match(/^language-(.+)$/);
            if (match && match[1] !== "undefined") {
              lang = match[1];
              break;
            }
          }
        }
        // Get only text content, stripping all <span> hljs wrappers and buttons
        const codeText = (codeEl || el).textContent || "";
        // Remove "Copy" prefix if it leaked from button
        const cleaned = codeText.replace(/^Copy\n?/, "");
        return `\n\n\`\`\`${lang}\n${cleaned.trimEnd()}\n\`\`\`\n\n`;
      }

      // Headings
      if (/^h([1-6])$/.test(tag)) {
        const level = parseInt(tag[1]);
        const prefix = "#".repeat(level);
        const text = processChildren(el).trim();
        return `\n\n${prefix} ${text}\n\n`;
      }

      // Paragraph
      if (tag === "p") {
        const text = processChildren(el).trim();
        if (!text) return "";
        return `\n\n${text}\n\n`;
      }

      // Bold / Italic — pass through content without markers
      // Emphasis markers add noise for LLM training and cause parsing
      // issues with nested/adjacent <em><strong> patterns in Freedium HTML
      if (tag === "strong" || tag === "b" || tag === "em" || tag === "i") {
        return processChildren(el);
      }

      // Inline code
      if (tag === "code") {
        const text = el.textContent || "";
        return `\`${text}\``;
      }

      // Links
      if (tag === "a") {
        const href = el.getAttribute("href") || "";
        const text = processChildren(el).trim();
        if (!text) return "";
        if (!href) return text;
        return `[${text}](${href})`;
      }

      // Images
      if (tag === "img") {
        const src = el.getAttribute("src") || "";
        const alt = el.getAttribute("alt") || "";
        return `![${alt}](${src})`;
      }

      // Unordered list
      if (tag === "ul") {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map((li) => `- ${processChildren(li).trim()}`)
          .join("\n");
        return `\n\n${items}\n\n`;
      }

      // Ordered list
      if (tag === "ol") {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map((li, i) => `${i + 1}. ${processChildren(li).trim()}`)
          .join("\n");
        return `\n\n${items}\n\n`;
      }

      // Blockquote
      if (tag === "blockquote") {
        const text = processChildren(el).trim();
        const quoted = text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return `\n\n${quoted}\n\n`;
      }

      // Line break
      if (tag === "br") return "\n";

      // Horizontal rule
      if (tag === "hr") return "\n\n---\n\n";

      // For any other element, just process children
      return processChildren(el);
    }

    function processChildren(el: Element): string {
      let result = "";
      for (const child of Array.from(el.childNodes)) {
        result += processNode(child);
      }
      return result;
    }

    let raw = processNode(root);

    // Collapse 3+ newlines to 2
    raw = raw.replace(/\n{3,}/g, "\n\n");

    return raw.trim();
  };
}
