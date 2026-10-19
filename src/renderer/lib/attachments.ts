import type { ClipboardEvent } from 'react';
import type { PromptAttachment } from '../../shared/types';
import { api } from './api';

export function promptAttachmentBlock(files: PromptAttachment[]) {
  return files
    .map((file) => {
      const language = file.extension.replace('.', '') || 'text';
      const suffix = file.truncated ? `\n\n[文件过大，仅读取前 ${Math.round(file.content.length / 1024)}KB]` : '';
      if (!file.supported) {
        return [`### 附件：${file.name}`, `路径：${file.path}`, file.content].join('\n');
      }
      return [
        `### 附件：${file.name}`,
        `路径：${file.path}`,
        '',
        `\`\`\`${language}`,
        file.content,
        '```',
        suffix
      ].join('\n');
    })
    .join('\n\n');
}

export async function pastedImageAttachments(event: ClipboardEvent<HTMLTextAreaElement>) {
  const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
  if (files.length === 0) return [];
  event.preventDefault();
  return Promise.all(
    files.map(
      (file, index) =>
        new Promise<PromptAttachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const attachment = await api.savePastedImage({
                name: file.name || `pasted-image-${index + 1}.png`,
                dataUrl: String(reader.result)
              });
              resolve(attachment);
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}

