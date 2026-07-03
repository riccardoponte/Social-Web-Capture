// crop-canvas.js - Sistema di crop personalizzato per l'estensione (VERSIONE DEFINITIVA E CORRETTA)

class CropCanvas {
    constructor(imageElement, options = {}) {
        this.image = imageElement;
        this.options = {
            aspectRatio: null,
            minWidth: 50,
            minHeight: 50,
            ...options
        };
        
        this.canvas = null;
        this.ctx = null;
        this.cropArea = { x: 0, y: 0, width: 0, height: 0 };
        
        this.isDragging = false;
        this.isResizing = false;
        this.dragStart = { x: 0, y: 0 };
        this.resizeHandle = null;
        
        // Bind degli eventi per poterli aggiungere e rimuovere correttamente.
        // Questo è il punto cruciale della correzione.
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
        this.boundOnTouchMove = this.onTouchMove.bind(this);
        this.boundOnTouchEnd = this.onTouchEnd.bind(this);

        this.init();
    }
    
    init() {
        this.createCanvas();
        this.setupEventListeners();
        this.initializeCropArea();
        this.render();
    }
    
    createCanvas() {
        this.container = document.createElement('div');
        this.container.style.position = 'relative';
        this.container.style.display = 'inline-block';
        
        this.image.parentNode.insertBefore(this.container, this.image);
        this.container.appendChild(this.image);
        
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.cursor = 'crosshair';
        this.canvas.style.zIndex = '10';
        
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);
        
        this.updateCanvasSize();
    }
    
    updateCanvasSize() {
        this.canvas.width = this.image.offsetWidth;
        this.canvas.height = this.image.offsetHeight;
        this.canvas.style.width = this.image.offsetWidth + 'px';
        this.canvas.style.height = this.image.offsetHeight + 'px';
    }
    
    initializeCropArea() {
        const padding = 50;
        this.cropArea = {
            x: padding,
            y: padding,
            width: this.canvas.width - (padding * 2),
            height: this.canvas.height - (padding * 2)
        };
        
        if (this.options.aspectRatio) {
            const maxWidth = this.canvas.width - (padding * 2);
            const maxHeight = this.canvas.height - (padding * 2);
            
            if (maxWidth / maxHeight > this.options.aspectRatio) {
                this.cropArea.width = maxHeight * this.options.aspectRatio;
                this.cropArea.height = maxHeight;
            } else {
                this.cropArea.width = maxWidth;
                this.cropArea.height = maxWidth / this.options.aspectRatio;
            }
            
            this.cropArea.x = (this.canvas.width - this.cropArea.width) / 2;
            this.cropArea.y = (this.canvas.height - this.cropArea.height) / 2;
        }
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('mousemove', this.onHover.bind(this));
    }
    
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.handlePointerDown(x, y);
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.handlePointerMove(x, y);
    }

    onMouseUp() {
        this.handlePointerUp();
    }

    onTouchStart(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        this.handlePointerDown(x, y);
    }

    onTouchMove(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        this.handlePointerMove(x, y);
    }

    onTouchEnd(e) {
        e.preventDefault();
        this.handlePointerUp();
    }

    onHover(e) {
        if (this.isDragging || this.isResizing) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const handle = this.getResizeHandle(x, y);
        if (handle) {
            this.canvas.style.cursor = this.getResizeCursor(handle);
        } else if (this.isInsideCropArea(x, y)) {
            this.canvas.style.cursor = 'move';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
    }

    handlePointerDown(x, y) {
        const handle = this.getResizeHandle(x, y);
        if (handle) {
            this.isResizing = true;
            this.resizeHandle = handle;
        } else if (this.isInsideCropArea(x, y)) {
            this.isDragging = true;
            this.dragStart = { x: x - this.cropArea.x, y: y - this.cropArea.y };
        }

        if (this.isResizing || this.isDragging) {
            window.addEventListener('mousemove', this.boundOnMouseMove);
            window.addEventListener('mouseup', this.boundOnMouseUp);
            window.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
            window.addEventListener('touchend', this.boundOnTouchEnd);
        }
    }

    handlePointerMove(x, y) {
        if (this.isResizing) {
            this.resizeCropArea(x, y);
        } else if (this.isDragging) {
            this.dragCropArea(x, y);
        }
        this.render();
    }

    handlePointerUp() {
        window.removeEventListener('mousemove', this.boundOnMouseMove);
        window.removeEventListener('mouseup', this.boundOnMouseUp);
        window.removeEventListener('touchmove', this.boundOnTouchMove);
        window.removeEventListener('touchend', this.boundOnTouchEnd);
        
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.onHover({ clientX: 0, clientY: 0 }); // Simula un evento per resettare il cursore
    }
    
    isInsideCropArea(x, y) {
        return x >= this.cropArea.x && 
               x <= this.cropArea.x + this.cropArea.width &&
               y >= this.cropArea.y && 
               y <= this.cropArea.y + this.cropArea.height;
    }
    
    getResizeHandle(x, y) {
        const handleSize = 10;
        const { x: cx, y: cy, width, height } = this.cropArea;
        
        if (this.isNearPoint(x, y, cx, cy, handleSize)) return 'nw';
        if (this.isNearPoint(x, y, cx + width, cy, handleSize)) return 'ne';
        if (this.isNearPoint(x, y, cx, cy + height, handleSize)) return 'sw';
        if (this.isNearPoint(x, y, cx + width, cy + height, handleSize)) return 'se';
        
        if (this.isNearPoint(x, y, cx + width/2, cy, handleSize)) return 'n';
        if (this.isNearPoint(x, y, cx + width, cy + height/2, handleSize)) return 'e';
        if (this.isNearPoint(x, y, cx + width/2, cy + height, handleSize)) return 's';
        if (this.isNearPoint(x, y, cx, cy + height/2, handleSize)) return 'w';
        
        return null;
    }
    
    isNearPoint(x, y, px, py, threshold) {
        return Math.abs(x - px) <= threshold && Math.abs(y - py) <= threshold;
    }
    
    getResizeCursor(handle) {
        const cursors = {
            'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
            'n': 'n-resize', 'e': 'e-resize', 's': 's-resize', 'w': 'w-resize'
        };
        return cursors[handle] || 'default';
    }
    
    dragCropArea(x, y) {
        const newX = x - this.dragStart.x;
        const newY = y - this.dragStart.y;
        
        this.cropArea.x = Math.max(0, Math.min(newX, this.canvas.width - this.cropArea.width));
        this.cropArea.y = Math.max(0, Math.min(newY, this.canvas.height - this.cropArea.height));
    }
    
    resizeCropArea(x, y) {
        const { x: cx, y: cy, width, height } = this.cropArea;
        let newX = cx, newY = cy, newWidth = width, newHeight = height;
        
        switch (this.resizeHandle) {
            case 'nw':
                newX = Math.min(x, cx + width - this.options.minWidth);
                newY = Math.min(y, cy + height - this.options.minHeight);
                newWidth = cx + width - newX;
                newHeight = cy + height - newY;
                break;
            case 'ne':
                newY = Math.min(y, cy + height - this.options.minHeight);
                newWidth = Math.max(this.options.minWidth, x - cx);
                newHeight = cy + height - newY;
                break;
            case 'sw':
                newX = Math.min(x, cx + width - this.options.minWidth);
                newWidth = cx + width - newX;
                newHeight = Math.max(this.options.minHeight, y - cy);
                break;
            case 'se':
                newWidth = Math.max(this.options.minWidth, x - cx);
                newHeight = Math.max(this.options.minHeight, y - cy);
                break;
            case 'n':
                newY = Math.min(y, cy + height - this.options.minHeight);
                newHeight = cy + height - newY;
                break;
            case 'e':
                newWidth = Math.max(this.options.minWidth, x - cx);
                break;
            case 's':
                newHeight = Math.max(this.options.minHeight, y - cy);
                break;
            case 'w':
                newX = Math.min(x, cx + width - this.options.minWidth);
                newWidth = cx + width - newX;
                break;
        }
        
        if (this.options.aspectRatio) {
            if (this.resizeHandle.includes('e') || this.resizeHandle.includes('w')) {
                newHeight = newWidth / this.options.aspectRatio;
            } else if (this.resizeHandle.includes('n') || this.resizeHandle.includes('s')) {
                newWidth = newHeight * this.options.aspectRatio;
            }
        }
        
        newWidth = Math.min(newWidth, this.canvas.width - newX);
        newHeight = Math.min(newHeight, this.canvas.height - newY);
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        
        this.cropArea = { x: newX, y: newY, width: newWidth, height: newHeight };
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.clearRect(this.cropArea.x, this.cropArea.y, this.cropArea.width, this.cropArea.height);
        
        this.ctx.strokeStyle = '#39f';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.cropArea.x, this.cropArea.y, this.cropArea.width, this.cropArea.height);
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 1;
        
        const thirdWidth = this.cropArea.width / 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.cropArea.x + thirdWidth, this.cropArea.y);
        this.ctx.lineTo(this.cropArea.x + thirdWidth, this.cropArea.y + this.cropArea.height);
        this.ctx.moveTo(this.cropArea.x + thirdWidth * 2, this.cropArea.y);
        this.ctx.lineTo(this.cropArea.x + thirdWidth * 2, this.cropArea.y + this.cropArea.height);
        this.ctx.stroke();
        
        const thirdHeight = this.cropArea.height / 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.cropArea.x, this.cropArea.y + thirdHeight);
        this.ctx.lineTo(this.cropArea.x + this.cropArea.width, this.cropArea.y + thirdHeight);
        this.ctx.moveTo(this.cropArea.x, this.cropArea.y + thirdHeight * 2);
        this.ctx.lineTo(this.cropArea.x + this.cropArea.width, this.cropArea.y + thirdHeight * 2);
        this.ctx.stroke();
        
        this.drawResizeHandles();
    }
    
    drawResizeHandles() {
        const handleSize = 8;
        const { x, y, width, height } = this.cropArea;
        
        this.ctx.fillStyle = '#39f';
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        
        const handles = [
            { x: x, y: y }, { x: x + width, y: y }, { x: x, y: y + height }, { x: x + width, y: y + height },
            { x: x + width/2, y: y }, { x: x + width, y: y + height/2 }, { x: x + width/2, y: y + height }, { x: x, y: y + height/2 }
        ];
        
        handles.forEach(handle => {
            this.ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
            this.ctx.strokeRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
        });
    }
    
    getCroppedCanvas() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const scaleX = this.image.naturalWidth / this.image.offsetWidth;
        const scaleY = this.image.naturalHeight / this.image.offsetHeight;
        
        const cropX = this.cropArea.x * scaleX;
        const cropY = this.cropArea.y * scaleY;
        const cropWidth = this.cropArea.width * scaleX;
        const cropHeight = this.cropArea.height * scaleY;
        
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        
        ctx.drawImage(this.image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        
        return canvas;
    }
    
    destroy() {
        // Rimuove tutti i listener per evitare memory leak
        window.removeEventListener('mousemove', this.boundOnMouseMove);
        window.removeEventListener('mouseup', this.boundOnMouseUp);
        window.removeEventListener('touchmove', this.boundOnTouchMove);
        window.removeEventListener('touchend', this.boundOnTouchEnd);

        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.insertBefore(this.image, this.container);
            this.container.parentNode.removeChild(this.container);
        }
    }
}

window.CropCanvas = CropCanvas;