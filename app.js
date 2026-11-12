/**
 * Main Application Controller (DentTrack)
 * Handles tab navigation, modals, profile management, PWA lifecycle and initial bootstrap.
 */

const App = {
  activeTab: 'calendar',

  init() {
    this.registerServiceWorker();
    this.checkInitialData();
    this.bindNavigation();
    this.bindProfileAndBackup();
    this.bindModalCloseEvents();

    // Initialize sub-modules
    ClinicsModule.init();
    ShiftsModule.init();
    CalendarModule.init();
    ReportsModule.init();
    this.loadProfileForm();

    // Inizializza sincronizzazione centralizzata con il server (Raspberry Pi / PC)
    Storage.initServerSync();

    // Default to calendar
    this.switchTab('calendar');
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./assets/sw.js').then(
          (reg) => console.log('ServiceWorker registered with scope:', reg.scope),
          (err) => console.log('ServiceWorker registration failed:', err)
        );
      });
    }
  },

  checkInitialData() {
    const clinics = Storage.getClinics();
    // If first time ever opening and no clinics exist, prompt or automatically offer demo data
    if (clinics.length === 0) {
      const banner = document.getElementById('first-time-banner');
      if (banner) banner.style.display = 'block';
    }
  },

  bindNavigation() {
    // Top desktop nav and bottom mobile nav links
    const navLinks = document.querySelectorAll('[data-tab-target]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = link.getAttribute('data-tab-target');
        this.switchTab(tab);
      });
    });
  },

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update active class on nav links
    document.querySelectorAll('[data-tab-target]').forEach(link => {
      if (link.getAttribute('data-tab-target') === tabName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update active tab section
    document.querySelectorAll('.tab-content-section').forEach(sec => {
      if (sec.id === `tab-${tabName}`) {
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    // Specific refresh actions per tab
    if (tabName === 'calendar') {
      CalendarModule.render();
    } else if (tabName === 'shifts') {
      ShiftsModule.updateClinicDropdowns();
      ShiftsModule.render();
    } else if (tabName === 'clinics') {
      ClinicsModule.render();
    } else if (tabName === 'reports') {
      ReportsModule.render();
    } else if (tabName === 'profile') {
      this.loadProfileForm();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  bindProfileAndBackup() {
    // Profile save form
    const formProfile = document.getElementById('form-profile');
    if (formProfile) {
      formProfile.addEventListener('submit', (e) => {
        e.preventDefault();
        const profile = {
          name: document.getElementById('prof-name').value.trim(),
          title: document.getElementById('prof-title').value.trim(),
          pIva: document.getElementById('prof-piva').value.trim(),
          codFiscale: document.getElementById('prof-cf').value.trim(),
          phone: document.getElementById('prof-phone').value.trim(),
          email: document.getElementById('prof-email').value.trim(),
          iban: document.getElementById('prof-iban').value.trim(),
          address: document.getElementById('prof-address').value.trim(),
          taxRegime: document.getElementById('prof-tax-regime') ? document.getElementById('prof-tax-regime').value : 'forfettario_15',
          customTaxRate: document.getElementById('prof-custom-tax-rate') ? (parseFloat(document.getElementById('prof-custom-tax-rate').value) || 28) : 28
        };
        Storage.saveProfile(profile);
        alert('Dati del profilo e impostazioni fiscali salvati con successo!');
        this.refreshAll();
      });

      const profRegimeSelect = document.getElementById('prof-tax-regime');
      if (profRegimeSelect) {
        profRegimeSelect.addEventListener('change', (e) => {
          const wrap = document.getElementById('prof-custom-tax-wrap');
          if (wrap) wrap.style.display = e.target.value === 'custom_free' ? 'block' : 'none';
        });
      }
    }

    // Export backup
    const btnExportBackup = document.getElementById('btn-export-backup');
    if (btnExportBackup) {
      btnExportBackup.addEventListener('click', () => Storage.exportBackup());
    }

    // Import backup
    const fileInputBackup = document.getElementById('file-input-backup');
    const btnTriggerImport = document.getElementById('btn-trigger-import');
    if (btnTriggerImport && fileInputBackup) {
      btnTriggerImport.addEventListener('click', () => fileInputBackup.click());
      fileInputBackup.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const res = Storage.importBackup(evt.target.result);
          if (res.success) {
            alert(`Ripristino completato con successo!\nCaricati: ${res.countClinics} studi e ${res.countShifts} turni.`);
            this.refreshAll();
          } else {
            alert('Errore nel file di backup: ' + res.error);
          }
        };
        reader.readAsText(file);
      });
    }

    // Load Demo Data
    const btnLoadDemo = document.getElementById('btn-load-demo-data');
    if (btnLoadDemo) {
      btnLoadDemo.addEventListener('click', () => {
        if (confirm('Vuoi caricare i dati di esempio (3 studi dentistici e 7 turni realistici)?\nI tuoi dati attuali verranno sostituiti.')) {
          Storage.loadSampleData();
          const banner = document.getElementById('first-time-banner');
          if (banner) banner.style.display = 'none';
          this.refreshAll();
          alert('Dati di esempio caricati con successo! Esplora il Calendario e il Rendiconto.');
        }
      });
    }

    // Banner Load Demo
    const btnBannerDemo = document.getElementById('btn-banner-load-demo');
    if (btnBannerDemo) {
      btnBannerDemo.addEventListener('click', () => {
        Storage.loadSampleData();
        const banner = document.getElementById('first-time-banner');
        if (banner) banner.style.display = 'none';
        this.refreshAll();
      });
    }

    // Reset Data
    const btnResetData = document.getElementById('btn-reset-data');
    if (btnResetData) {
      btnResetData.addEventListener('click', () => {
        if (confirm('ATTENZIONE: Sei sicura di voler cancellare TUTTI i dati (studi, turni, profilo)?\nQuesta azione non può essere annullata.')) {
          Storage.clearAllData();
          this.refreshAll();
          alert('Tutti i dati sono stati cancellati.');
        }
      });
    }
  },

  loadProfileForm() {
    const p = Storage.getProfile();
    document.getElementById('prof-name').value = p.name || '';
    document.getElementById('prof-title').value = p.title || '';
    document.getElementById('prof-piva').value = p.pIva || '';
    document.getElementById('prof-cf').value = p.codFiscale || '';
    document.getElementById('prof-phone').value = p.phone || '';
    document.getElementById('prof-email').value = p.email || '';
    document.getElementById('prof-iban').value = p.iban || '';
    document.getElementById('prof-address').value = p.address || '';
    
    const regimeEl = document.getElementById('prof-tax-regime');
    if (regimeEl) regimeEl.value = p.taxRegime || 'forfettario_15';
    
    const customRateEl = document.getElementById('prof-custom-tax-rate');
    if (customRateEl) customRateEl.value = p.customTaxRate || 28;
    
    const wrap = document.getElementById('prof-custom-tax-wrap');
    if (wrap) wrap.style.display = (p.taxRegime === 'custom_free') ? 'block' : 'none';
  },

  bindModalCloseEvents() {
    // Close modal on background click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
      }
    });

    // Close buttons inside modals
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });
  },

  refreshAll() {
    ClinicsModule.render();
    ShiftsModule.updateClinicDropdowns();
    ShiftsModule.render();
    CalendarModule.render();
    ReportsModule.render();
  }
};

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
