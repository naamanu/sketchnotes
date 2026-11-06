import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Saves a file and opens the share sheet (native) or downloads it (browser). */
export async function shareFile(name: string, blob: Blob) {
  const safe = name.replace(/[^\w.\- ]+/g, "_");
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: safe,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    await Share.share({ title: safe, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safe;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
