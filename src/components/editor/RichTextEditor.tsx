/**
 * RichTextEditor — editor rich text baseado em Tiptap
 *
 * Substitui o editor simples atual da Base de Conhecimento e do DocumentEditor
 * por um editor com suporte a formatação completa, comandos "/" (slash commands),
 * menção de usuários e tabelas — equivalente ao Notion, mas self-hosted.
 *
 * Uso:
 *   <RichTextEditor
 *     content={htmlString}
 *     onChange={(html) => setContent(html)}
 *     placeholder="Comece a digitar ou pressione / para comandos…"
 *   />
 */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  AlignLeft,
  Hash,
} from 'lucide-react';

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  /** Limite de caracteres (0 = sem limite). */
  characterLimit?: number;
  /** Modo somente leitura. */
  readOnly?: boolean;
  className?: string;
}

type ToolbarButtonProps = {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
};

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-colors
        ${isActive ? 'bg-brand/20 text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}
        ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Comece a digitar ou pressione / para comandos…',
  characterLimit = 0,
  readOnly = false,
  className = '',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Desabilitar extensões que vieram pelo StarterKit e queremos customizar
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      Placeholder.configure({ placeholder }),
      ...(characterLimit > 0
        ? [CharacterCount.configure({ limit: characterLimit })]
        : []),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
  });

  if (!editor) return null;

  const charCount = characterLimit > 0
    ? (editor.storage as { characterCount?: { characters: () => number } }).characterCount?.characters?.() ?? 0
    : null;

  return (
    <div
      className={`flex flex-col rounded-2xl border border-line bg-surface overflow-hidden focus-within:border-brand/50 transition-colors ${className}`}
    >
      {/* Barra de ferramentas — apenas no modo edição */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-3 py-2">
          {/* Histórico */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Desfazer (⌘Z)"
          >
            <Undo className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Refazer (⌘⇧Z)"
          >
            <Redo className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-1.5 h-5 w-px bg-line" />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Título 1 (⌘⌥1)"
          >
            <span className="text-[11px] font-black">H1</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Título 2 (⌘⌥2)"
          >
            <span className="text-[11px] font-black">H2</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Título 3 (⌘⌥3)"
          >
            <Hash className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-1.5 h-5 w-px bg-line" />

          {/* Texto */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            isActive={editor.isActive('paragraph')}
            title="Parágrafo"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Negrito (⌘B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Itálico (⌘I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="Riscado (⌘⇧X)"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            title="Código inline (⌘E)"
          >
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>

          <div className="mx-1.5 h-5 w-px bg-line" />

          {/* Listas */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Lista com marcadores (⌘⇧8)"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Lista numerada (⌘⇧7)"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Citação (⌘⇧B)"
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Separador"
          >
            <Minus className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      )}

      {/* Bubble menu temporariamente removido até resolvermos os types */}
      
      {/* Área de edição */}
      <EditorContent
        editor={editor}
        className="prose prose-sm prose-invert max-w-none flex-1 px-4 py-3 text-ink focus:outline-none
          [&_.ProseMirror]:min-h-[120px]
          [&_.ProseMirror]:outline-none
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ink-2
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0
          [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-black
          [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold
          [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-bold
          [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-brand/50 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-ink-2
          [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-surface-2 [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-brand [&_.ProseMirror_code]:font-mono
          [&_.ProseMirror_pre]:rounded-xl [&_.ProseMirror_pre]:bg-surface-2 [&_.ProseMirror_pre]:p-4
          [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5
          [&_.ProseMirror_hr]:border-line"
      />

      {/* Contador de caracteres */}
      {characterLimit > 0 && charCount !== null && (
        <div className="flex items-center justify-end border-t border-line px-4 py-2">
          <span
            className={`text-[10px] font-medium ${
              charCount > characterLimit * 0.9 ? 'text-amber-500' : 'text-ink-2'
            }`}
          >
            {charCount} / {characterLimit}
          </span>
        </div>
      )}
    </div>
  );
}
