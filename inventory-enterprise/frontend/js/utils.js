// Utility functions for the Enterprise Inventory System

// Date and Time Utilities
const DateUtils = {
    formatDate(dateString, options = {}) {
        if (!dateString) return 'N/A';
        
        const date = new Date(dateString);
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };
        
        return date.toLocaleDateString('en-US', { ...defaultOptions, ...options });
    },
    
    formatDateTime(dateString, options = {}) {
        if (!dateString) return 'N/A';
        
        const date = new Date(dateString);
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleString('en-US', { ...defaultOptions, ...options });
    },
    
    getRelativeTime(dateString) {
        if (!dateString) return 'Unknown';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        
        return this.formatDate(dateString);
    },
    
    isExpiringSoon(expiryDate, daysThreshold = 7) {
        if (!expiryDate) return false;
        
        const expiry = new Date(expiryDate);
        const now = new Date();
        const diffTime = expiry - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays <= daysThreshold && diffDays >= 0;
    },
    
    isExpired(expiryDate) {
        if (!expiryDate) return false;
        
        const expiry = new Date(expiryDate);
        const now = new Date();
        
        return expiry < now;
    }
};

// Number and Currency Utilities
const NumberUtils = {
    formatNumber(num, decimals = 2) {
        if (num === null || num === undefined) return '0';
        
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    },
    
    formatCurrency(amount, currency = 'USD') {
        if (amount === null || amount === undefined) return '$0.00';
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    },
    
    formatPercentage(value, decimals = 1) {
        if (value === null || value === undefined) return '0%';
        
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value / 100);
    },
    
    abbreviateNumber(num) {
        if (num === null || num === undefined) return '0';
        
        const units = ['', 'K', 'M', 'B', 'T'];
        let unitIndex = 0;
        let value = Math.abs(num);
        
        while (value >= 1000 && unitIndex < units.length - 1) {
            value /= 1000;
            unitIndex++;
        }
        
        const formatted = value < 10 ? value.toFixed(1) : Math.round(value);
        return (num < 0 ? '-' : '') + formatted + units[unitIndex];
    }
};

// String Utilities
const StringUtils = {
    escapeHtml(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    truncate(text, length = 50, suffix = '...') {
        if (!text) return '';
        if (text.length <= length) return text;
        
        return text.substr(0, length).trim() + suffix;
    },
    
    capitalizeFirst(text) {
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    },
    
    capitalizeWords(text) {
        if (!text) return '';
        return text.split(' ').map(word => this.capitalizeFirst(word)).join(' ');
    },
    
    slugify(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },
    
    generateId(prefix = '', length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return prefix + result;
    }
};

// Array and Object Utilities
const DataUtils = {
    sortBy(array, key, direction = 'asc') {
        if (!Array.isArray(array)) return [];
        
        return [...array].sort((a, b) => {
            let aVal = this.getNestedValue(a, key);
            let bVal = this.getNestedValue(b, key);
            
            // Handle null/undefined values
            if (aVal === null || aVal === undefined) aVal = '';
            if (bVal === null || bVal === undefined) bVal = '';
            
            // Convert to strings for comparison if needed
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (direction === 'desc') {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            } else {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            }
        });
    },
    
    groupBy(array, key) {
        if (!Array.isArray(array)) return {};
        
        return array.reduce((groups, item) => {
            const value = this.getNestedValue(item, key);
            const group = groups[value] || [];
            group.push(item);
            groups[value] = group;
            return groups;
        }, {});
    },
    
    filterBy(array, filters) {
        if (!Array.isArray(array)) return [];
        if (!filters || Object.keys(filters).length === 0) return array;
        
        return array.filter(item => {
            return Object.entries(filters).every(([key, value]) => {
                if (!value) return true; // Skip empty filters
                
                const itemValue = this.getNestedValue(item, key);
                if (itemValue === null || itemValue === undefined) return false;
                
                // Handle different filter types
                if (typeof value === 'string') {
                    return itemValue.toString().toLowerCase().includes(value.toLowerCase());
                } else if (typeof value === 'boolean') {
                    return itemValue === value;
                } else if (Array.isArray(value)) {
                    return value.includes(itemValue);
                } else {
                    return itemValue === value;
                }
            });
        });
    },
    
    getNestedValue(obj, path) {
        if (!path) return obj;
        
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : null;
        }, obj);
    },
    
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        const target = keys.reduce((current, key) => {
            if (!(key in current)) current[key] = {};
            return current[key];
        }, obj);
        
        target[lastKey] = value;
        return obj;
    },
    
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        
        const cloned = {};
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    }
};

// Validation Utilities
const ValidationUtils = {
    isEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },
    
    isPhone(phone) {
        const phoneRegex = /^\+?[\d\s-().]+$/;
        return phoneRegex.test(phone);
    },
    
    isUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },
    
    isNumeric(value) {
        return !isNaN(parseFloat(value)) && isFinite(value);
    },
    
    isInteger(value) {
        return Number.isInteger(Number(value));
    },
    
    isPositive(value) {
        return this.isNumeric(value) && Number(value) > 0;
    },
    
    isInRange(value, min, max) {
        const num = Number(value);
        return this.isNumeric(value) && num >= min && num <= max;
    },
    
    hasMinLength(value, minLength) {
        return value && value.toString().length >= minLength;
    },
    
    hasMaxLength(value, maxLength) {
        return !value || value.toString().length <= maxLength;
    },
    
    matchesPattern(value, pattern) {
        if (!value) return false;
        const regex = new RegExp(pattern);
        return regex.test(value);
    }
};

// Local Storage Utilities
const StorageUtils = {
    set(key, value, expiry = null) {
        try {
            const data = {
                value: value,
                expiry: expiry ? Date.now() + expiry : null
            };
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
            return false;
        }
    },
    
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return defaultValue;
            
            const data = JSON.parse(item);
            
            // Check if expired
            if (data.expiry && Date.now() > data.expiry) {
                this.remove(key);
                return defaultValue;
            }
            
            return data.value;
        } catch (error) {
            console.error('Failed to retrieve from localStorage:', error);
            return defaultValue;
        }
    },
    
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Failed to remove from localStorage:', error);
            return false;
        }
    },
    
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Failed to clear localStorage:', error);
            return false;
        }
    },
    
    keys() {
        return Object.keys(localStorage);
    },
    
    size() {
        return localStorage.length;
    }
};

// DOM Utilities
const DOMUtils = {
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        
        // Set attributes
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        
        // Append children
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Element) {
                element.appendChild(child);
            }
        });
        
        return element;
    },
    
    findElements(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    },
    
    findElement(selector, parent = document) {
        return parent.querySelector(selector);
    },
    
    addClass(element, className) {
        if (element && className) {
            element.classList.add(className);
        }
    },
    
    removeClass(element, className) {
        if (element && className) {
            element.classList.remove(className);
        }
    },
    
    toggleClass(element, className) {
        if (element && className) {
            element.classList.toggle(className);
        }
    },
    
    hasClass(element, className) {
        return element && className && element.classList.contains(className);
    },
    
    show(element) {
        if (element) {
            element.style.display = '';
        }
    },
    
    hide(element) {
        if (element) {
            element.style.display = 'none';
        }
    },
    
    toggle(element) {
        if (element) {
            element.style.display = element.style.display === 'none' ? '' : 'none';
        }
    }
};

// File Utilities
const FileUtils = {
    downloadText(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    },
    
    downloadJSON(data, filename) {
        const content = JSON.stringify(data, null, 2);
        this.downloadText(content, filename, 'application/json');
    },
    
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    },
    
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    },
    
    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
    },
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// Export utilities to global scope
window.Utils = {
    Date: DateUtils,
    Number: NumberUtils,
    String: StringUtils,
    Data: DataUtils,
    Validation: ValidationUtils,
    Storage: StorageUtils,
    DOM: DOMUtils,
    File: FileUtils
};

// Additional helper functions
window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

window.throttle = function(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

window.formatCurrency = NumberUtils.formatCurrency;
window.formatDate = DateUtils.formatDate;
window.escapeHtml = StringUtils.escapeHtml;