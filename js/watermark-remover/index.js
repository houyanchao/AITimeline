/**
 * Watermark Remover - Content Script Integration
 * 
 * Based on gemini-watermark-remover by journey-ad (Jad)
 * Original: https://github.com/journey-ad/gemini-watermark-remover
 * License: MIT - Copyright (c) 2025 Jad
 * 
 * Automatically detects and removes watermarks from Gemini-generated images on the page.
 */

(function() {
    'use strict';

    // Only run on Gemini
    if (!window.location.hostname.includes('gemini.google.com')) {
        return;
    }

    let engine = null;
    const processingQueue = new Set();
    let isEnabled = true;

    /**
     * Debounce function to limit execution frequency
     */
    const debounce = (func, wait) => {
        let timeout = null;
        return (...args) => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    };

    /**
     * Check if an image element is a valid Gemini-generated image
     */
    const isValidGeminiImage = (img) => {
        return img.closest('generated-image, .generated-image-container, [data-generated-image]') !== null;
    };

    /**
     * Find all Gemini-generated images on the page
     */
    const findGeminiImages = () => {
        return [...document.querySelectorAll('img[src*="googleusercontent.com"]')].filter(
            (img) => isValidGeminiImage(img) && img.dataset.watermarkProcessed !== 'true'
        );
    };

    /**
     * Replace image URL size parameter to get full resolution
     * Google image URL parameters:
     * - =s0 : original size
     * - =s1600 : max 1600px
     * - =w1920-h1080 : specific dimensions
     * - =d : download original
     */
    const replaceWithNormalSize = (src) => {
        // Remove size constraints to get original resolution
        // =s0 means original size without any resizing
        let url = src.replace(/=s\d+(?=[-?#]|$)/, '=s0');
        // Also handle width/height parameters
        url = url.replace(/=w\d+-h\d+/, '=s0');
        return url;
    };

    /**
     * Fetch image and convert to Image element
     * Tries with CORS first, falls back to fetch API if needed
     */
    const fetchImage = async (url) => {
        // First try: load with crossOrigin (for CORS-enabled servers)
        try {
            const img = await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('CORS load failed'));
                img.src = url;
            });
            return img;
        } catch (e) {
            console.log('[AI Chat Timeline] CORS load failed, trying fetch API...');
        }

        // Second try: use fetch API to get blob (works for same-origin)
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            const img = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    URL.revokeObjectURL(objectUrl); // Clean up
                    resolve(img);
                };
                img.onerror = () => reject(new Error('Blob load failed'));
                img.src = objectUrl;
            });
            return img;
        } catch (e) {
            console.log('[AI Chat Timeline] Fetch API failed, trying without CORS...');
        }

        // Third try: load without crossOrigin (may cause tainted canvas)
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    };

    /**
     * Convert canvas to blob with high quality
     * @param {HTMLCanvasElement} canvas 
     * @param {string} type - MIME type (image/png, image/jpeg, image/webp)
     * @param {number} quality - Quality for lossy formats (0-1)
     */
    const canvasToBlob = (canvas, type = 'image/png', quality = 1.0) =>
        new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to convert canvas to blob'));
            }, type, quality);
        });

    /**
     * Detect image format from URL
     */
    const detectImageFormat = (url) => {
        // Google's image URLs don't have clear extensions, default to PNG for best quality
        if (url.includes('=rw-')) {
            return { type: 'image/webp', ext: 'webp', quality: 1.0 };
        }
        // Default to PNG for lossless quality
        return { type: 'image/png', ext: 'png', quality: 1.0 };
    };

    /**
     * Add a download button with watermark removed
     */
    function addDownloadButton(imgElement, processedUrl, fileExt = 'png') {
        const container = imgElement.closest('generated-image, .generated-image-container, [data-generated-image]');
        if (!container) return;

        // Check if button already exists
        if (container.querySelector('.nanobanana-download-btn')) return;

        // Create download button
        const btn = document.createElement('button');
        btn.className = 'nanobanana-download-btn';
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>🍌</span>
        `;
        // Tooltip - 使用全局 Tooltip 管理器（白色背景）
        btn.addEventListener('mouseenter', () => {
            if (window.globalTooltipManager) {
                const tooltipText = chrome.i18n.getMessage('watermarkRemoverDownload') || 'Download without watermark';
                window.globalTooltipManager.show(
                    'watermark-download-btn',
                    'button',
                    btn,
                    tooltipText,
                    {
                        placement: 'top',
                        color: {
                            dark: {
                                backgroundColor: '#ffffff',
                                textColor: '#1f2937',
                                borderColor: '#e5e7eb'
                            },
                            light: {
                                backgroundColor: '#0d0d0d',
                                textColor: '#ffffff',
                                borderColor: '#0d0d0d'
                            }
                        }
                    }
                );
            }
        });
        
        btn.addEventListener('mouseleave', () => {
            if (window.globalTooltipManager) {
                window.globalTooltipManager.hide();
            }
        });

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                // Create download link with correct extension
                const link = document.createElement('a');
                link.href = processedUrl;
                link.download = `gemini-image-${Date.now()}.${fileExt}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Show success feedback
                btn.classList.add('success');
                setTimeout(() => btn.classList.remove('success'), 1000);
            } catch (error) {
                console.error('[AI Chat Timeline] Download failed:', error);
            }
        });

        // Position the button
        const currentPosition = getComputedStyle(container).position;
        if (currentPosition === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(btn);
    }

    /**
     * Process a single image to remove watermark
     */
    async function processImage(imgElement) {
        if (!engine || processingQueue.has(imgElement)) return;

        processingQueue.add(imgElement);
        imgElement.dataset.watermarkProcessed = 'processing';

        const originalSrc = imgElement.src;
        try {
            // Fetch full resolution image
            const normalSizeSrc = replaceWithNormalSize(originalSrc);
            const normalSizeImg = await fetchImage(normalSizeSrc);

            // Process image to remove watermark
            const processedCanvas = await engine.removeWatermarkFromImage(normalSizeImg);
            
            // Use PNG format with maximum quality for lossless output
            const format = detectImageFormat(originalSrc);
            const processedBlob = await canvasToBlob(processedCanvas, format.type, format.quality);

            // Create processed blob URL
            const processedUrl = URL.createObjectURL(processedBlob);
            
            // Store format info for download
            imgElement.dataset.imageFormat = format.ext;
            
            // Replace image source with processed blob URL
            imgElement.src = processedUrl;
            imgElement.dataset.watermarkProcessed = 'true';
            imgElement.dataset.processedUrl = processedUrl;
            imgElement.dataset.originalUrl = originalSrc;

            console.log('[AI Chat Timeline] Watermark removed from image, format:', format.type, 'size:', processedBlob.size);

            // Add download button
            addDownloadButton(imgElement, processedUrl, format.ext);
        } catch (error) {
            console.warn('[AI Chat Timeline] Failed to process image:', error);
            imgElement.dataset.watermarkProcessed = 'failed';
        } finally {
            processingQueue.delete(imgElement);
        }
    }

    /**
     * Process all Gemini-generated images on the page
     */
    const processAllImages = () => {
        if (!isEnabled) return;
        
        const images = findGeminiImages();
        images.forEach(processImage);
    };

    /**
     * Setup MutationObserver to watch for new images
     */
    const setupMutationObserver = () => {
        const debouncedProcess = debounce(processAllImages, 100);
        new MutationObserver(debouncedProcess).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'src']
        });
        console.log('[AI Chat Timeline] Watermark remover MutationObserver active');
    };

    /**
     * Check if feature is enabled
     */
    async function checkEnabled() {
        try {
            const result = await chrome.storage?.local?.get('watermarkRemoverEnabled');
            isEnabled = result?.watermarkRemoverEnabled !== false;
            return isEnabled;
        } catch (e) {
            return true; // Default to enabled
        }
    }

    /**
     * Initialize the watermark remover
     */
    async function init() {
        try {
            // Check if feature is enabled
            const enabled = await checkEnabled();
            if (!enabled) {
                console.log('[AI Chat Timeline] Watermark remover is disabled');
                return;
            }

            console.log('[AI Chat Timeline] Initializing watermark remover...');
            
            // Create engine instance
            engine = await window.WatermarkEngine.create();

            // Process existing images
            processAllImages();

            // Watch for new images
            setupMutationObserver();

            console.log('[AI Chat Timeline] Watermark remover ready');
        } catch (error) {
            console.error('[AI Chat Timeline] Watermark remover initialization failed:', error);
        }
    }

    // Listen for settings changes
    chrome.storage?.onChanged?.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.watermarkRemoverEnabled) {
            isEnabled = changes.watermarkRemoverEnabled.newValue !== false;
            if (isEnabled) {
                processAllImages();
            }
        }
    });

    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Delay initialization slightly to ensure other modules are loaded
        setTimeout(init, 500);
    }

    // Export for external use
    window.AIChatTimelineWatermarkRemover = {
        processImage,
        processAllImages,
        isEnabled: () => isEnabled,
        setEnabled: (enabled) => {
            isEnabled = enabled;
            if (enabled) processAllImages();
        }
    };
})();
