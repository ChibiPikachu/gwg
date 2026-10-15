import React, { useState, useRef } from 'react';
import { 
  Bold, Italic, Strikethrough, Heading1, Heading2, 
  List, ListOrdered, Quote, Code, Link as LinkIcon, 
  Eye, Edit3, HelpCircle, Check, X, EyeOff, Sparkles, Minus
} from 'lucide-react';
import SteamgiftsMarkdown from './SteamgiftsMarkdown';
import { cn } from '@/lib/utils';

interface SteamgiftsMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  teamStyle?: any;
  onSave?: () => void;
  onCancel?: () => void;
  isSaving?: boolean;
  saveButtonText?: string;
  title?: string;
}

export default function SteamgiftsMarkdownEditor({
  value,
  onChange,
  placeholder = "Write description using Steamgifts Markdown syntax...",
  rows = 8,
  teamStyle,
  onSave,
  onCancel,
  isSaving = false,
  saveButtonText = "Save Description",
  title = "Markdown Editor (Steamgifts Syntax)"
}: SteamgiftsMarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to insert formatting at cursor or around selection
  const insertFormatting = (prefix: string, suffix: string = '', defaultPlaceholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value ? `${value}\n${prefix}${defaultPlaceholder}${suffix}` : `${prefix}${defaultPlaceholder}${suffix}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const textToInsert = selectedText || defaultPlaceholder;
    const replacement = `${prefix}${textToInsert}${suffix}`;
    
    const newValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + textToInsert.length;
      textarea.setSelectionRange(
        start + prefix.length,
        newCursorPos
      );
    }, 0);
  };

  const insertTemplate = () => {
    const template = `## 🌟 Cycle Themes
* **Theme 1:** Neon Horizons & Nightscapes
* **Theme 2:** Minimalist Geometry & Brutalism
* **Theme 3:** Dramatic Action & Dynamic Motion

---

### 📋 Submission Rules & Criteria
* HUD turned off is strongly preferred for cinematic framing.
* Submit up to **10 screenshots**; select **1** as your voting entry.
* [spoiler]Bonus points awarded for creative lighting composition![/spoiler]

> *"Capturing virtual worlds through players' lenses."*`;
    onChange(template);
  };

  return (
    <div className="space-y-3">
      {/* Editor Header Bar with Tabs and Formatting Guide */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          {/* Write / Preview Tab Switcher */}
          <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('write')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === 'write'
                  ? teamStyle?.badgeBg ? cn(teamStyle.badgeBg, teamStyle.badgeText, "border", teamStyle.badgeBorder) : "bg-white/20 text-white"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Edit3 size={13} /> Write
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === 'preview'
                  ? teamStyle?.badgeBg ? cn(teamStyle.badgeBg, teamStyle.badgeText, "border", teamStyle.badgeBorder) : "bg-white/20 text-white"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Eye size={13} /> Preview
            </button>
          </div>

          <span className="text-xs text-white/40 hidden md:inline">|</span>
          <span className="text-xs text-slate-300 font-medium hidden md:inline">{title}</span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={insertTemplate}
            className={cn("text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-lg border", teamStyle?.badgeBg || "bg-white/5", teamStyle?.badgeText || "text-slate-300", teamStyle?.badgeBorder || "border-white/10")}
          >
            <Sparkles size={12} /> Load Theme Template
          </button>
          <button
            type="button"
            onClick={() => setShowGuide(prev => !prev)}
            className="text-[11px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"
          >
            <HelpCircle size={12} /> Steamgifts Markdown Guide
          </button>
        </div>
      </div>

      {/* Steamgifts Markdown Reference Cheatsheet Dropdown */}
      {showGuide && (
        <div className="p-3.5 bg-black/50 dark:bg-black/60 rounded-xl border border-white/10 text-xs text-slate-300 space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-1 border-b border-white/10">
            <span className="font-bold text-white flex items-center gap-1.5">
              <HelpCircle size={14} className={teamStyle?.iconText || "text-sky-400"} />
              Steamgifts Markdown Syntax Reference
            </span>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] pt-1">
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">**bold**</span>
              <p className="text-slate-400 text-[10px]"><strong>Bold text</strong></p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">*italic*</span>
              <p className="text-slate-400 text-[10px]"><em>Italic text</em></p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">~~strike~~</span>
              <p className="text-slate-400 text-[10px]"><del>Strikethrough</del></p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono"># Heading</span>
              <p className="text-slate-400 text-[10px]">H1 Header</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">* Item</span>
              <p className="text-slate-400 text-[10px]">Bullet point</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">1. Item</span>
              <p className="text-slate-400 text-[10px]">Numbered list</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">[Link](url)</span>
              <p className="text-slate-400 text-[10px]">Clickable hyperlink</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">[spoiler]text[/spoiler]</span>
              <p className="text-slate-400 text-[10px]">Click-to-reveal</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">&gt; Quote</span>
              <p className="text-slate-400 text-[10px]">Blockquote box</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">`code`</span>
              <p className="text-slate-400 text-[10px]">Inline code badge</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">```code```</span>
              <p className="text-slate-400 text-[10px]">Code block</p>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-white font-mono">---</span>
              <p className="text-slate-400 text-[10px]">Divider line</p>
            </div>
          </div>
        </div>
      )}

      {/* Write View: Toolbar + Textarea */}
      {activeTab === 'write' ? (
        <div className="space-y-2">
          {/* Markdown Formatting Toolbar */}
          <div className="flex items-center gap-1 p-1.5 bg-black/40 rounded-xl border border-white/10 flex-wrap overflow-x-auto">
            <button
              type="button"
              onClick={() => insertFormatting('**', '**', 'bold text')}
              title="Bold (**text**)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('*', '*', 'italic text')}
              title="Italic (*text*)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('~~', '~~', 'strikethrough text')}
              title="Strikethrough (~~text~~)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Strikethrough size={14} />
            </button>
            <span className="w-[1px] h-4 bg-white/15 mx-0.5" />
            <button
              type="button"
              onClick={() => insertFormatting('# ', '', 'Main Heading')}
              title="Heading 1 (# text)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Heading1 size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('## ', '', 'Subheading')}
              title="Heading 2 (## text)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Heading2 size={14} />
            </button>
            <span className="w-[1px] h-4 bg-white/15 mx-0.5" />
            <button
              type="button"
              onClick={() => insertFormatting('* ', '', 'List item')}
              title="Bullet list (* item)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('1. ', '', 'Numbered item')}
              title="Numbered list (1. item)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <ListOrdered size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('> ', '', 'Quote text')}
              title="Blockquote (> text)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Quote size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('`', '`', 'code')}
              title="Inline code (`code`)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Code size={14} />
            </button>
            <span className="w-[1px] h-4 bg-white/15 mx-0.5" />
            <button
              type="button"
              onClick={() => insertFormatting('[', '](https://)', 'Link text')}
              title="Insert Link ([text](url))"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <LinkIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('[spoiler]', '[/spoiler]', 'spoiler text')}
              title="Steamgifts Spoiler tag ([spoiler]text[/spoiler])"
              className={cn(
                "p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono px-2",
                teamStyle?.iconText || "text-slate-300 hover:text-white"
              )}
            >
              <EyeOff size={13} />
              <span>[spoiler]</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('\n---\n', '', '')}
              title="Horizontal Rule (---)"
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Minus size={14} />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "w-full bg-black/60 dark:bg-black/70 border rounded-xl p-3.5 text-sm dark:text-white text-slate-100 placeholder:text-white/30 focus:outline-none transition-all leading-relaxed font-sans",
              teamStyle?.inputBorder || "border-white/20",
              teamStyle?.inputFocus || "focus:border-white/40"
            )}
          />
        </div>
      ) : (
        /* Preview Tab */
        <div className="p-4 rounded-xl bg-black/40 border border-white/10 min-h-[160px] overflow-y-auto">
          {value.trim() ? (
            <SteamgiftsMarkdown content={value} teamAccent={teamStyle?.iconText} teamStyle={teamStyle} />
          ) : (
            <p className="text-xs text-white/40 italic py-6 text-center">
              Nothing to preview. Enter markdown in the Write tab!
            </p>
          )}
        </div>
      )}

      {/* Footer Bar with Character Count and Action Buttons */}
      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <div className="text-[11px] text-slate-400 flex items-center gap-2">
          <span>{value.length} characters</span>
          <span>•</span>
          <span>{value.trim() ? value.trim().split(/\s+/).length : 0} words</span>
          <span>•</span>
          <span className="italic">Steamgifts Markdown enabled</span>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 disabled:opacity-50",
                teamStyle?.btnPrimary || "bg-sky-600 hover:bg-sky-500 text-white"
              )}
            >
              <Check size={14} />
              {isSaving ? "Saving..." : saveButtonText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
