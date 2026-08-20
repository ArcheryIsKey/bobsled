/**
 * Safely processes and compresses an image file to a base64 Data URL.
 * Handles high-resolution images, crops/resizes cleanly, and enforces small payload sizes.
 */
export function processImageFile(
  file: File,
  maxDimension: number = 256,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if valid image type
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Scale dimensions proportionally
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          // High-quality downsampling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Produce JPEG or WebP data URL
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to decode image file'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file from disk'));
    reader.readAsDataURL(file);
  });
}

/**
 * Processes banner images with wider aspect ratios and max width 1200px.
 */
export function processBannerFile(
  file: File,
  maxWidth: number = 1000,
  maxHeight: number = 350,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);

          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to decode banner image'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file from disk'));
    reader.readAsDataURL(file);
  });
}
