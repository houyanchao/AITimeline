/**
 * Watermark Engine Main Module
 * 
 * Based on gemini-watermark-remover by journey-ad (Jad)
 * Original: https://github.com/journey-ad/gemini-watermark-remover
 * License: MIT - Copyright (c) 2025 Jad
 * 
 * Coordinates watermark detection, alpha map calculation, and removal operations.
 */

/**
 * Detect watermark configuration based on image size
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {Object} Watermark configuration {logoSize, marginRight, marginBottom}
 */
function detectWatermarkConfig(imageWidth, imageHeight) {
    // Gemini's watermark rules:
    // If both image width and height are greater than 1024, use 96×96 watermark
    // Otherwise, use 48×48 watermark
    if (imageWidth > 1024 && imageHeight > 1024) {
        return {
            logoSize: 96,
            marginRight: 64,
            marginBottom: 64,
        };
    } else {
        return {
            logoSize: 48,
            marginRight: 32,
            marginBottom: 32,
        };
    }
}

/**
 * Calculate watermark position in image based on image size and watermark configuration
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @param {Object} config - Watermark configuration {logoSize, marginRight, marginBottom}
 * @returns {Object} Watermark position {x, y, width, height}
 */
function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { logoSize, marginRight, marginBottom } = config;

    return {
        x: imageWidth - marginRight - logoSize,
        y: imageHeight - marginBottom - logoSize,
        width: logoSize,
        height: logoSize,
    };
}

/**
 * Watermark engine class
 * Coordinates watermark detection, alpha map calculation, and removal operations
 */
class WatermarkEngine {
    constructor(bgCaptures) {
        this.bgCaptures = bgCaptures;
        this.alphaMaps = {};
    }

    /**
     * Create a new WatermarkEngine instance
     * @returns {Promise<WatermarkEngine>}
     */
    static async create() {
        const bg48 = new Image();
        const bg96 = new Image();

        // Try to load from extension resources first, then fallback to CDN
        const bg48Path = WatermarkEngine.getAssetPath('bg_48.png');
        const bg96Path = WatermarkEngine.getAssetPath('bg_96.png');

        console.log('[AI Chat Timeline] Loading watermark assets:', { bg48Path, bg96Path });

        try {
            await Promise.all([
                WatermarkEngine.loadImage(bg48, bg48Path),
                WatermarkEngine.loadImage(bg96, bg96Path),
            ]);
        } catch (error) {
            console.warn('[AI Chat Timeline] Failed to load local assets, trying CDN fallback...');
            
            // Fallback to jsDelivr CDN
            const cdnBase = 'https://cdn.jsdelivr.net/gh/journey-ad/gemini-watermark-remover@main/src/assets';
            await Promise.all([
                WatermarkEngine.loadImage(bg48, `${cdnBase}/bg_48.png`),
                WatermarkEngine.loadImage(bg96, `${cdnBase}/bg_96.png`),
            ]);
        }

        return new WatermarkEngine({ bg48, bg96 });
    }

    /**
     * Get asset path for extension resources
     * @param {string} filename - Asset filename
     * @returns {string} Full path to asset
     */
    static getAssetPath(filename) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            return chrome.runtime.getURL(`js/watermark-remover/assets/${filename}`);
        }
        return `js/watermark-remover/assets/${filename}`;
    }

    /**
     * Load an image with promise
     * @param {HTMLImageElement} img - Image element
     * @param {string} src - Image source URL
     * @returns {Promise<void>}
     */
    static loadImage(img, src) {
        return new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (e) => reject(new Error(`Failed to load image from ${src}`));
            img.crossOrigin = 'anonymous';
            img.src = src;
        });
    }

    /**
     * Get alpha map from background captured image based on watermark size
     * @param {number} size - Watermark size (48 or 96)
     * @returns {Promise<Float32Array>} Alpha map
     */
    async getAlphaMap(size) {
        // If cached, return directly
        if (this.alphaMaps[size]) {
            return this.alphaMaps[size];
        }

        // Select corresponding background capture based on watermark size
        const bgImage = size === 48 ? this.bgCaptures.bg48 : this.bgCaptures.bg96;

        // Create temporary canvas to extract ImageData
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get canvas 2d context');
        }
        ctx.drawImage(bgImage, 0, 0);

        const imageData = ctx.getImageData(0, 0, size, size);

        // Calculate alpha map using the calculateAlphaMap function
        const alphaMap = window.WatermarkRemoverAlphaMap.calculateAlphaMap(imageData);

        // Cache result
        this.alphaMaps[size] = alphaMap;

        return alphaMap;
    }

    /**
     * Remove watermark from image
     * @param {HTMLImageElement|HTMLCanvasElement} image - Input image
     * @returns {Promise<HTMLCanvasElement>} Processed canvas
     */
    async removeWatermarkFromImage(image) {
        // Create canvas to process image
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get canvas 2d context');
        }

        // Draw original image onto canvas
        ctx.drawImage(image, 0, 0);

        // Detect watermark configuration
        const config = detectWatermarkConfig(canvas.width, canvas.height);
        const position = calculateWatermarkPosition(canvas.width, canvas.height, config);

        // Check if watermark position is valid (within image bounds)
        if (position.x < 0 || position.y < 0 || 
            position.x + position.width > canvas.width || 
            position.y + position.height > canvas.height) {
            console.warn('[AI Chat Timeline] Image too small for watermark removal, returning original');
            return canvas;
        }

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Get alpha map for watermark size
        const alphaMap = await this.getAlphaMap(config.logoSize);

        // Remove watermark from image data
        window.WatermarkRemoverBlendModes.removeWatermark(imageData, alphaMap, position);

        // Write processed image data back to canvas
        ctx.putImageData(imageData, 0, 0);

        return canvas;
    }

    /**
     * Get watermark information (for display)
     * @param {number} imageWidth - Image width
     * @param {number} imageHeight - Image height
     * @returns {Object} Watermark information {size, position, config}
     */
    getWatermarkInfo(imageWidth, imageHeight) {
        const config = detectWatermarkConfig(imageWidth, imageHeight);
        const position = calculateWatermarkPosition(imageWidth, imageHeight, config);

        return {
            size: config.logoSize,
            position: position,
            config: config,
        };
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.WatermarkEngine = WatermarkEngine;
}
