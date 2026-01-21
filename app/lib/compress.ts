import { canvas } from "framer-motion/client";

export const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      if (event.target && event.target.result) {
        img.src = event.target.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          
          // AGGRESSIVE RESIZING
          let width = img.width;
          let height = img.height;
          const maxSize = 600;

          if (width > height) {
            if (width > maxSize) {
              height *= maxSize / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width *= maxSize / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG at 60% quality
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          resolve(dataUrl.split(",")[1]); 
        }; // img.onload ends here
      }
    }; // reader.onload ends here
  });
};