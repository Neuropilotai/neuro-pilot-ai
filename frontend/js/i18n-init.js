/**
 * i18n Initialization Module
 * Auto-detects browser language and provides language switching
 */

// Extended i18n translations for the entire system
const I18N = {
  en: {
    // Auth
    login_title: 'Secure Login',
    email: 'Email',
    password: 'Password',
    sign_in: 'Sign In',
    sign_out: 'Sign Out',
    
    // Navigation
    inventory: 'Inventory',
    orders: 'Orders',
    move: 'Move',
    receive: 'Receive',
    ai_suggestions: 'AI Suggestions',
    logged_in: 'Logged in',
    dashboard: 'Dashboard',
    locations: 'Locations',
    reports: 'Reports',
    settings: 'Settings',
    
    // Location Manager
    location_manager: 'Location Manager',
    add_by_stock: 'Add by Stock Number',
    stock_number: 'Stock Number',
    location: 'Location',
    sequence: 'Sequence',
    quantity: 'Quantity',
    add_item: 'Add Item',
    search_placeholder: 'Enter stock number or name...',
    bulk_assign: 'Bulk Assign',
    items_in_location: 'Items in Location',
    no_items: 'No items in this location',
    update_sequence: 'Update Sequence',
    remove_from_location: 'Remove from Location',
    select_locations: 'Select Locations',
    apply_to_all: 'Apply to All Selected',
    item_added: 'Item added successfully',
    item_removed: 'Item removed successfully',
    sequence_updated: 'Sequence updated successfully',
    error_adding: 'Error adding item',
    error_removing: 'Error removing item',
    loading: 'Loading...',
    select_multiple: 'Select multiple locations (Ctrl+Click)',
    auto_sequence: 'Auto-sequence items',
    sequence_by_category: 'Sequence by Category',
    sequence_by_name: 'Sequence by Name',
    print_location: 'Print Location List',
    export_csv: 'Export to CSV',
    
    // Common
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    filter: 'Filter',
    refresh: 'Refresh',
    actions: 'Actions',
    status: 'Status',
    date: 'Date',
    time: 'Time',
    total: 'Total',
    subtotal: 'Subtotal',
    yes: 'Yes',
    no: 'No',
    confirm: 'Confirm',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Information'
  },
  fr: {
    // Auth
    login_title: 'Connexion sécurisée',
    email: 'Courriel',
    password: 'Mot de passe',
    sign_in: 'Ouvrir une session',
    sign_out: 'Fermer la session',
    
    // Navigation
    inventory: 'Inventaire',
    orders: 'Commandes',
    move: 'Déplacer',
    receive: 'Réceptionner',
    ai_suggestions: 'Suggestions IA',
    logged_in: 'Connecté',
    dashboard: 'Tableau de bord',
    locations: 'Emplacements',
    reports: 'Rapports',
    settings: 'Paramètres',
    
    // Location Manager
    location_manager: 'Gestionnaire d\'emplacements',
    add_by_stock: 'Ajouter par numéro de stock',
    stock_number: 'Numéro de stock',
    location: 'Emplacement',
    sequence: 'Séquence',
    quantity: 'Quantité',
    add_item: 'Ajouter l\'article',
    search_placeholder: 'Entrez le numéro de stock ou le nom...',
    bulk_assign: 'Attribution en masse',
    items_in_location: 'Articles dans l\'emplacement',
    no_items: 'Aucun article dans cet emplacement',
    update_sequence: 'Mettre à jour la séquence',
    remove_from_location: 'Retirer de l\'emplacement',
    select_locations: 'Sélectionner les emplacements',
    apply_to_all: 'Appliquer à tous les sélectionnés',
    item_added: 'Article ajouté avec succès',
    item_removed: 'Article retiré avec succès',
    sequence_updated: 'Séquence mise à jour avec succès',
    error_adding: 'Erreur lors de l\'ajout de l\'article',
    error_removing: 'Erreur lors du retrait de l\'article',
    loading: 'Chargement...',
    select_multiple: 'Sélectionner plusieurs emplacements (Ctrl+Clic)',
    auto_sequence: 'Séquencer automatiquement',
    sequence_by_category: 'Séquencer par catégorie',
    sequence_by_name: 'Séquencer par nom',
    print_location: 'Imprimer la liste',
    export_csv: 'Exporter en CSV',
    
    // Common
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    search: 'Rechercher',
    filter: 'Filtrer',
    refresh: 'Actualiser',
    actions: 'Actions',
    status: 'Statut',
    date: 'Date',
    time: 'Heure',
    total: 'Total',
    subtotal: 'Sous-total',
    yes: 'Oui',
    no: 'Non',
    confirm: 'Confirmer',
    success: 'Succès',
    error: 'Erreur',
    warning: 'Avertissement',
    info: 'Information'
  }
};

// Get current language
export function getLang() {
  return localStorage.getItem('lang') || 'en';
}

// Set language and update UI
export function setLang(lang = 'en') {
  const validLang = (lang === 'fr') ? 'fr' : 'en';
  localStorage.setItem('lang', validLang);
  document.documentElement.setAttribute('lang', validLang);
  
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = (I18N[validLang] && I18N[validLang][key]) || key;
    
    if ('value' in el && (el.tagName === 'INPUT' || el.tagName === 'BUTTON')) {
      el.value = text;
    } else if (el.tagName === 'INPUT' && el.type === 'placeholder') {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
  
  // Update language selector if it exists
  const langSelector = document.getElementById('lang-select');
  if (langSelector) {
    langSelector.value = validLang;
  }
  
  // Trigger custom event for components to update
  window.dispatchEvent(new CustomEvent('languageChanged', { 
    detail: { language: validLang } 
  }));
}

// Get translated text
export function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

// Initialize language on page load
function initializeLanguage() {
  // Auto-detect language from browser
  const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  const detectedLang = browserLang.startsWith('fr') ? 'fr' : 'en';
  
  // Check if user has a saved preference
  const savedLang = localStorage.getItem('lang');
  
  // Use saved preference or detected language
  const initialLang = savedLang || detectedLang;
  
  // Set the language
  setLang(initialLang);
  
  // Setup language selector if it exists
  const langSelector = document.getElementById('lang-select');
  if (langSelector) {
    langSelector.value = initialLang;
    langSelector.addEventListener('change', (e) => {
      setLang(e.target.value);
    });
  }
  
  // Add language switcher if it doesn't exist
  if (!langSelector && document.body) {
    const switcher = document.createElement('div');
    switcher.id = 'lang-switcher';
    switcher.innerHTML = `
      <select id="lang-select" style="position: fixed; top: 10px; right: 10px; z-index: 9999; padding: 5px; border-radius: 4px; border: 1px solid #ddd;">
        <option value="en">English</option>
        <option value="fr">Français</option>
      </select>
    `;
    document.body.appendChild(switcher);
    
    const newSelector = document.getElementById('lang-select');
    newSelector.value = initialLang;
    newSelector.addEventListener('change', (e) => {
      setLang(e.target.value);
    });
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLanguage);
} else {
  initializeLanguage();
}

// Listen for language preference changes in other tabs
window.addEventListener('storage', (e) => {
  if (e.key === 'lang' && e.newValue) {
    setLang(e.newValue);
  }
});

// Export translations for direct access
export { I18N };

// Default export
export default {
  getLang,
  setLang,
  t,
  I18N
};