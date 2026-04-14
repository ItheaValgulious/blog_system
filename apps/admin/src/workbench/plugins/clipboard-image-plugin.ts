import type { PluginDefinition } from "../types";

const IMAGE_FILE_NAME_PATTERN = /\.(png|jpe?g|gif|webp|svg)$/i;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read clipboard image."));
    reader.readAsDataURL(blob);
  });
}

export const clipboardImagePlugin: PluginDefinition = {
  id: "clipboard-image",
  label: "Clipboard Images",
  description: "Uploads pasted image content or copied image files and inserts Markdown references.",
  activate(context) {
    context.registerPasteHandler({
      id: "clipboard-image",
      async handle({ event, editor, activeDocument, uploadClipboardImages }) {
        if (!activeDocument || activeDocument.kind !== "article") {
          return false;
        }

        const clipboardItems = Array.from(event.clipboardData?.items ?? []);
        const clipboardFiles = Array.from(event.clipboardData?.files ?? []);
        const imageFiles = [
          ...clipboardItems
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file))
            .filter(
              (file) => file.type.startsWith("image/") || IMAGE_FILE_NAME_PATTERN.test(file.name)
            ),
          ...clipboardFiles.filter(
            (file) => file.type.startsWith("image/") || IMAGE_FILE_NAME_PATTERN.test(file.name)
          )
        ].filter(
          (file, index, files) =>
            files.findIndex(
              (candidate) =>
                candidate.name === file.name &&
                candidate.size === file.size &&
                candidate.type === file.type &&
                candidate.lastModified === file.lastModified
            ) === index
        );

        if (imageFiles.length === 0) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();

        const textPayload = event.clipboardData?.getData("text/plain") ?? "";
        const images = await Promise.all(
          imageFiles.map(async (file, index) => {
            return {
              mimeType: file.type || "image/png",
              base64Data: await blobToBase64(file),
              fileName: file.name || `pasted-image-${index + 1}`
            };
          })
        );
        const uploadedAssets = await uploadClipboardImages(activeDocument.articlePath, images);
        const imageMarkdown = uploadedAssets
          .map((asset, index) => `![pasted-image-${index + 1}](${asset.markdownPath})`)
          .join("\n");
        const combinedText = [textPayload.trim(), imageMarkdown].filter(Boolean).join("\n\n");
        const selection = editor.getSelection();
        const position = editor.getPosition();
        const insertionRange =
          selection ??
          (position
            ? {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column
              }
            : {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1
              });

        editor.pushUndoStop();
        editor.executeEdits("clipboard-image", [
          {
            range: insertionRange,
            text: combinedText
          }
        ]);
        editor.pushUndoStop();
        editor.focus();
        return true;
      }
    });
  }
};
