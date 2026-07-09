import { Pipe, PipeTransform } from '@angular/core';

/**
 * Parser de Markdown minimalista, síncrono, sin dependencias.
 *
 * Soporta:
 *  - **negrita**, *itálica*
 *  - `código` en línea y ```bloques```
 *  - # títulos (h1, h2, h3)
 *  - - listas y 1. listas numeradas
 *  - > citas
 *  - [texto](url) enlaces
 *  - párrafos y saltos de línea
 *
 * Escapa el HTML entrante para evitar XSS.
 */
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return this.render(value);
  }

  private render(input: string): string {
    // 1. Escapar HTML del input para que el usuario no pueda inyectar tags
    const escaped = this.escape(input);

    // 2. Extraer bloques primero (código multilínea, citas, listas, títulos)
    // y dejar párrafos con el resto.
    const lines = escaped.split(/\n/);
    const out: string[] = [];
    let i = 0;
    let inList: 'ul' | 'ol' | null = null;
    let paragraph: string[] = [];

    const closeList = () => {
      if (inList) {
        out.push(`</${inList}>`);
        inList = null;
      }
    };
    const closeParagraph = () => {
      if (paragraph.length) {
        out.push(`<p>${this.renderInline(paragraph.join(' '))}</p>`);
        paragraph = [];
      }
    };

    while (i < lines.length) {
      const line = lines[i];

      // Bloque de código ```
      if (line.startsWith('```')) {
        closeList();
        closeParagraph();
        const code: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          code.push(lines[i]);
          i++;
        }
        out.push(`<pre><code>${code.join('\n')}</code></pre>`);
        i++; // skip closing ```
        continue;
      }

      // Título
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        closeList();
        closeParagraph();
        const level = h[1].length;
        out.push(`<h${level}>${this.renderInline(h[2])}</h${level}>`);
        i++;
        continue;
      }

      // Cita >
      if (line.startsWith('> ')) {
        closeList();
        closeParagraph();
        out.push(`<blockquote>${this.renderInline(line.slice(2))}</blockquote>`);
        i++;
        continue;
      }

      // Lista no ordenada -
      if (line.match(/^[-*]\s+(.*)$/)) {
        closeParagraph();
        if (inList !== 'ul') {
          closeList();
          out.push('<ul>');
          inList = 'ul';
        }
        out.push(`<li>${this.renderInline(line.replace(/^[-*]\s+/, ''))}</li>`);
        i++;
        continue;
      }

      // Lista ordenada 1.
      if (line.match(/^\d+\.\s+(.*)$/)) {
        closeParagraph();
        if (inList !== 'ol') {
          closeList();
          out.push('<ol>');
          inList = 'ol';
        }
        out.push(`<li>${this.renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
        continue;
      }

      // Línea vacía → fin de párrafo/lista
      if (line.trim() === '') {
        closeList();
        closeParagraph();
        i++;
        continue;
      }

      // Línea normal → acumula párrafo
      paragraph.push(line);
      i++;
    }

    closeList();
    closeParagraph();
    return out.join('');
  }

  /** Procesa énfasis, código en línea y enlaces. */
  private renderInline(text: string): string {
    return text
      // código en línea (escapado ya)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // enlaces [text](url)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // negrita ** antes que cursiva
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // cursiva *
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      // saltos de línea
      .replace(/\n/g, '<br>');
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}