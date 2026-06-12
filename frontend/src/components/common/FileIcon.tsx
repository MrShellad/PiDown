import { useState, useEffect } from "react";
import {
  File,
  Film,
  Music,
  Archive,
  Image as ImageIcon,
  FileText,
  FileCode,
} from "lucide-react";

export interface CustomFileIcon {
  id: string;
  extensions: string[]; // e.g. ["mp4", "mkv"]
  iconType: "png" | "svg";
  iconData: string; // base64 string for PNG, or SVG string for SVG
  color?: string; // color for SVG
}

export function getCustomFileIcons(): CustomFileIcon[] {
  try {
    const data = localStorage.getItem("pidown_custom_file_icons");
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to parse custom file icons:", e);
    return [];
  }
}

export function saveCustomFileIcons(icons: CustomFileIcon[]) {
  try {
    localStorage.setItem("pidown_custom_file_icons", JSON.stringify(icons));
    window.dispatchEvent(new Event("pidown_custom_icons_changed"));
  } catch (e) {
    console.error("Failed to save custom file icons:", e);
  }
}

export function useCustomFileIcons() {
  const [icons, setIcons] = useState<CustomFileIcon[]>(() => getCustomFileIcons());

  useEffect(() => {
    const handleUpdate = () => {
      setIcons(getCustomFileIcons());
    };
    window.addEventListener("pidown_custom_icons_changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("pidown_custom_icons_changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return icons;
}

export function preprocessSvg(svgContent: string): string {
  let processed = svgContent;
  
  // Replace hex/rgb colors in fill and stroke attributes if they are not none/transparent
  processed = processed.replace(/fill=["'](?!none|transparent)[^"']+["']/gi, 'fill="currentColor"');
  processed = processed.replace(/stroke=["'](?!none|transparent)[^"']+["']/gi, 'stroke="currentColor"');
  
  // Replace in style attributes
  processed = processed.replace(/fill\s*:\s*(?!none|transparent)[^;}'"]+/gi, 'fill:currentColor');
  processed = processed.replace(/stroke\s*:\s*(?!none|transparent)[^;}'"]+/gi, 'stroke:currentColor');
  
  return processed;
}

const VIDEO_EXTS = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "rmvb", "m4v"];
const AUDIO_EXTS = ["mp3", "wav", "flac", "ogg", "wma", "aac", "m4a", "ape"];
const ARCHIVE_EXTS = ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"];
const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tiff"];
const DOC_EXTS = ["txt", "md", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "epub"];
const CODE_EXTS = ["js", "ts", "jsx", "tsx", "html", "css", "json", "py", "rs", "go", "cpp", "c", "sh", "bat"];

interface FileIconProps {
  filename: string;
  className?: string;
}

export function FileIcon({ filename, className = "size-4" }: FileIconProps) {
  const customIcons = useCustomFileIcons();
  
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  // 1. Try custom icon first
  const customIcon = customIcons.find((icon) =>
    icon.extensions.some((e) => e.toLowerCase() === ext)
  );

  if (customIcon) {
    if (customIcon.iconType === "png") {
      return (
        <img
          src={customIcon.iconData}
          alt={ext}
          className={className}
          style={{ objectFit: "contain" }}
        />
      );
    } else if (customIcon.iconType === "svg") {
      const colorStyle = customIcon.color ? { color: customIcon.color } : undefined;
      return (
        <span
          className={`inline-flex items-center justify-center custom-file-icon-svg ${className}`}
          style={colorStyle}
        >
          <style>{`
            .custom-file-icon-svg svg {
              width: 100%;
              height: 100%;
              display: block;
            }
          `}</style>
          <span
            dangerouslySetInnerHTML={{ __html: customIcon.iconData }}
            className="w-full h-full flex items-center justify-center"
          />
        </span>
      );
    }
  }

  // 2. Fallback to default group icons
  if (VIDEO_EXTS.includes(ext)) {
    return <Film className={className} />;
  }
  if (AUDIO_EXTS.includes(ext)) {
    return <Music className={className} />;
  }
  if (ARCHIVE_EXTS.includes(ext)) {
    return <Archive className={className} />;
  }
  if (IMAGE_EXTS.includes(ext)) {
    return <ImageIcon className={className} />;
  }
  if (DOC_EXTS.includes(ext)) {
    return <FileText className={className} />;
  }
  if (CODE_EXTS.includes(ext)) {
    return <FileCode className={className} />;
  }

  return <File className={className} />;
}
