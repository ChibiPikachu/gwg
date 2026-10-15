import React, { useState } from 'react';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
  teamAccent?: string;
  teamStyle?: any;
}

// Interactive Spoiler Component for [spoiler]text[/spoiler] or ~text~
export function MarkdownSpoiler({ text, teamStyle }: { text: string; teamStyle?: any }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(prev => !prev);
      }}
      title={revealed ? "Click to hide spoiler" : "Click to reveal spoiler"}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-all text-xs font-mono select-none",
        revealed
          ? teamStyle?.badgeBg
            ? cn(teamStyle.badgeBg, teamStyle.badgeText, "border", teamStyle.badgeBorder)
            : "bg-white/15 text-white border border-white/25"
          : "bg-black/60 dark:bg-white/10 hover:bg-white/15 text-transparent border border-white/15 select-none blur-[4px] hover:blur-[2px]"
      )}
    >
      <span className={revealed ? 'inline' : 'invisible'}>{text}</span>
      {!revealed && <span className="text-[10px] text-white/50 not-italic font-sans pointer-events-none">spoiler</span>}
    </span>
  );
}

// Parse inline formatting: bold, italic, strikethrough, code, links, images, spoilers
export function renderInlineMarkdown(text: string, teamAccent?: string, teamStyle?: any): React.ReactNode[] {
  if (!text) return [];

  // Match all inline tokens
  // 1: Spoilers: [spoiler]...[/spoiler] or ~...~
  // 2: Images: ![alt](url)
  // 3: Links: [text](url)
  // 4: Code: `code`
  // 5: Bold-Italic: ***text***
  // 6: Bold: **text** or __text__
  // 7: Strikethrough: ~~text~~
  // 8: Italic: *text* or _text_
  const tokenRegex = /\[spoiler\]([\s\S]*?)\[\/spoiler\]|~([^~]+)~|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = tokenRegex.lastIndex;

    // Plain text before match
    if (matchStart > lastIndex) {
      elements.push(text.slice(lastIndex, matchStart));
    }

    const key = `inline-${matchStart}`;

    if (match[1] !== undefined) {
      // [spoiler]text[/spoiler]
      elements.push(<MarkdownSpoiler key={key} text={match[1]} teamStyle={teamStyle} />);
    } else if (match[2] !== undefined) {
      // ~text~ spoiler
      elements.push(<MarkdownSpoiler key={key} text={match[2]} teamStyle={teamStyle} />);
    } else if (match[3] !== undefined && match[4] !== undefined) {
      // ![alt](url)
      const alt = match[3];
      const url = match[4];
      elements.push(
        <span key={key} className="inline-block my-1 max-w-full">
          <img
            src={url}
            alt={alt || 'embedded image'}
            className="max-h-60 rounded-xl border border-white/10 object-contain shadow-sm my-1 inline"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </span>
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // [text](url)
      const linkText = match[5];
      let href = match[6].trim();
      if (!/^https?:\/\//i.test(href) && !href.startsWith('/')) {
        href = `https://${href}`;
      }
      elements.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-sky-400 hover:text-sky-300 underline underline-offset-2 font-medium transition-colors cursor-pointer"
        >
          <span>{linkText}</span>
          <ExternalLink size={10} className="inline opacity-70" />
        </a>
      );
    } else if (match[7] !== undefined) {
      // `code`
      elements.push(
        <code
          key={key}
          className="px-1.5 py-0.5 bg-black/40 dark:bg-white/10 text-emerald-300 rounded font-mono text-[11px] border border-white/10"
        >
          {match[7]}
        </code>
      );
    } else if (match[8] !== undefined) {
      // ***bold italic***
      elements.push(
        <strong key={key} className="font-black italic text-white">
          {match[8]}
        </strong>
      );
    } else if (match[9] !== undefined || match[10] !== undefined) {
      // **bold** or __bold__
      const boldText = match[9] !== undefined ? match[9] : match[10];
      elements.push(
        <strong key={key} className="font-black text-white">
          {boldText}
        </strong>
      );
    } else if (match[11] !== undefined) {
      // ~~strikethrough~~
      elements.push(
        <del key={key} className="line-through opacity-60">
          {match[11]}
        </del>
      );
    } else if (match[12] !== undefined || match[13] !== undefined) {
      // *italic* or _italic_
      const italicText = match[12] !== undefined ? match[12] : match[13];
      elements.push(
        <em key={key} className="italic text-slate-200">
          {italicText}
        </em>
      );
    }

    lastIndex = matchEnd;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

export default function SteamgiftsMarkdown({ content, className = '', teamAccent, teamStyle }: MarkdownProps) {
  if (!content || !content.trim()) return null;

  // Clean out internal SUBMISSION_POINTS and other machine tags
  const clean = content
    .replace(/<!--SUBMISSION_POINTS:\d+-->/g, '')
    .replace(/<!--.*?-->/g, '')
    .trim();

  if (!clean) return null;

  // Split content into lines to parse block structures
  const lines = clean.split('\n');
  const renderedBlocks: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      if (inList === 'ul') {
        renderedBlocks.push(
          <ul key={`ul-${renderedBlocks.length}`} className="list-disc pl-5 my-2 space-y-1 text-sm text-slate-200">
            {listItems}
          </ul>
        );
      } else {
        renderedBlocks.push(
          <ol key={`ol-${renderedBlocks.length}`} className="list-decimal pl-5 my-2 space-y-1 text-sm text-slate-200">
            {listItems}
          </ol>
        );
      }
      inList = null;
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block fences
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        renderedBlocks.push(
          <pre
            key={`codeblock-${renderedBlocks.length}`}
            className="bg-black/60 dark:bg-black/80 border border-white/10 rounded-xl p-3 my-2 text-xs font-mono text-emerald-300 overflow-x-auto"
          >
            <code>{codeBlockContent.join('\n')}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockContent = [];
      } else {
        flushList();
        inCodeBlock = true;
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      renderedBlocks.push(
        <hr key={`hr-${renderedBlocks.length}`} className="border-t border-white/10 my-3" />
      );
      continue;
    }

    // Headers
    if (trimmed.startsWith('#')) {
      flushList();
      const headerMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = headerMatch[2];
        const inlineNodes = renderInlineMarkdown(text, teamAccent, teamStyle);

        if (level === 1) {
          renderedBlocks.push(
            <h1 key={`h1-${renderedBlocks.length}`} className={cn("text-lg md:text-xl font-black text-white mt-4 mb-2 tracking-tight flex items-center gap-2", teamStyle?.iconText)}>
              {inlineNodes}
            </h1>
          );
        } else if (level === 2) {
          renderedBlocks.push(
            <h2 key={`h2-${renderedBlocks.length}`} className={cn("text-base md:text-lg font-bold text-white mt-3 mb-1.5 tracking-tight flex items-center gap-2", teamStyle?.iconText)}>
              {inlineNodes}
            </h2>
          );
        } else if (level === 3) {
          renderedBlocks.push(
            <h3 key={`h3-${renderedBlocks.length}`} className="text-sm md:text-base font-bold text-slate-100 mt-2 mb-1">
              {inlineNodes}
            </h3>
          );
        } else {
          renderedBlocks.push(
            <h4 key={`h4-${renderedBlocks.length}`} className="text-xs md:text-sm font-bold text-slate-200 mt-2 mb-1">
              {inlineNodes}
            </h4>
          );
        }
        continue;
      }
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushList();
      const quoteText = trimmed.replace(/^>\s?/, '');
      renderedBlocks.push(
        <blockquote
          key={`quote-${renderedBlocks.length}`}
          className={cn(
            "border-l-4 pl-3.5 py-1.5 my-2 italic text-slate-300 bg-white/[0.02] rounded-r-lg",
            teamStyle?.badgeBorder || "border-sky-400/60"
          )}
        >
          {renderInlineMarkdown(quoteText, teamAccent, teamStyle)}
        </blockquote>
      );
      continue;
    }

    // Unordered List (- item or * item)
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        flushList();
        inList = 'ul';
      }
      listItems.push(
        <li key={`li-${listItems.length}`} className="leading-relaxed">
          {renderInlineMarkdown(ulMatch[1], teamAccent, teamStyle)}
        </li>
      );
      continue;
    }

    // Ordered List (1. item)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        flushList();
        inList = 'ol';
      }
      listItems.push(
        <li key={`oli-${listItems.length}`} className="leading-relaxed">
          {renderInlineMarkdown(olMatch[2], teamAccent, teamStyle)}
        </li>
      );
      continue;
    }

    // Empty line / paragraph break
    if (trimmed === '') {
      flushList();
      continue;
    }

    // Regular paragraph line
    flushList();
    renderedBlocks.push(
      <p key={`p-${renderedBlocks.length}`} className="text-sm leading-relaxed text-slate-200 my-1 font-normal">
        {renderInlineMarkdown(line, teamAccent, teamStyle)}
      </p>
    );
  }

  // Final flush
  flushList();
  if (inCodeBlock && codeBlockContent.length > 0) {
    renderedBlocks.push(
      <pre
        key={`codeblock-end`}
        className="bg-black/60 border border-white/10 rounded-xl p-3 my-2 text-xs font-mono text-emerald-300 overflow-x-auto"
      >
        <code>{codeBlockContent.join('\n')}</code>
      </pre>
    );
  }

  return <div className={`space-y-1 font-sans ${className}`}>{renderedBlocks}</div>;
}
