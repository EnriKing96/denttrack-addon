/**
 * Storage Layer for DentTrack
 * Manages LocalStorage persistence, backup export/import and sample data.
 */

const STORAGE_KEYS = {
  PROFILE: 'denttrack_profile',
  CLINICS: 'denttrack_clinics',
  SHIFTS: 'denttrack_shifts',
  SETTINGS: 'denttrack_settings'
};

const DEFAULT_TREATMENTS = [
  { id: 'igiene', name: 'Igiene / Detartrasi ordinaria', defaultFee: 80, defaultCut: 35 },
  { id: 'prima_visita_igiene', name: 'Prima Visita + Igiene', defaultFee: 95, defaultCut: 40 },
  { id: 'levigatura', name: 'Levigatura radicolare (quadrante)', defaultFee: 100, defaultCut: 45 },
  { id: 'sbiancamento_led', name: 'Sbiancamento professionale (LED/Laser)', defaultFee: 250, defaultCut: 90 },
  { id: 'sbiancamento_domiciliare', name: 'Sbiancamento domiciliare con mascherine', defaultFee: 200, defaultCut: 70 },
  { id: 'sigillatura', name: 'Sigillatura dei solchi (a dente)', defaultFee: 40, defaultCut: 15 },
  { id: 'desensibilizzante', name: 'Trattamento Desensibilizzante / Fluoro', defaultFee: 50, defaultCut: 20 },
  { id: 'terapia_perio', name: 'Terapia parodontale avanzata', defaultFee: 130, defaultCut: 55 },
  { id: 'altro', name: 'Altra prestazione personalizzata', defaultFee: 70, defaultCut: 30 }
];

const CLINIC_COLORS = [
  '#0284c7', // Sky Blue
  '#0d9488', // Teal
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#f97316'  // Orange
];

const Storage = {
  // --- Profile ---
  getProfile() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
      const defaults = {
        name: 'Dott.ssa Giulia',
        title: 'Igienista Dentale - Iscritta all\'Albo',
        pIva: '',
        codFiscale: '',
        phone: '',
        email: '',
        iban: '',
        address: '',
        taxRegime: 'forfettario_15',
        customTaxRate: 28
      };
      return data ? { ...defaults, ...JSON.parse(data) } : defaults;
    } catch (e) {
      console.error('Error loading profile', e);
      return {};
    }
  },

  calculateTaxesAndNet(gross, regime = null, customRate = null) {
    gross = Math.max(0, parseFloat(gross) || 0);
    const profile = this.getProfile();
    const selRegime = regime || profile.taxRegime || 'forfettario_15';
    const selRate = customRate !== null && customRate !== undefined ? customRate : (profile.customTaxRate || 28);

    let inpsAmount = 0;
    let taxAmount = 0;
    let totalReserve = 0;

    if (selRegime === 'forfettario_5') {
      // Coeff. redditività 78%, INPS Gestione Separata 26.07%, Imposta 5%
      const taxable = gross * 0.78;
      inpsAmount = taxable * 0.2607;
      const taxableAfterInps = Math.max(0, taxable - inpsAmount);
      taxAmount = taxableAfterInps * 0.05;
      totalReserve = inpsAmount + taxAmount;
    } else if (selRegime === 'forfettario_15') {
      // Coeff. redditività 78%, INPS Gestione Separata 26.07%, Imposta 15%
      const taxable = gross * 0.78;
      inpsAmount = taxable * 0.2607;
      const taxableAfterInps = Math.max(0, taxable - inpsAmount);
      taxAmount = taxableAfterInps * 0.15;
      totalReserve = inpsAmount + taxAmount;
    } else if (selRegime === 'custom_25') {
      totalReserve = gross * 0.25;
      inpsAmount = gross * 0.18;
      taxAmount = gross * 0.07;
    } else if (selRegime === 'custom_30') {
      totalReserve = gross * 0.30;
      inpsAmount = gross * 0.21;
      taxAmount = gross * 0.09;
    } else if (selRegime === 'custom_free') {
      const rate = Math.max(0, Math.min(100, parseFloat(selRate) || 28)) / 100;
      totalReserve = gross * rate;
      inpsAmount = totalReserve * 0.70;
      taxAmount = totalReserve * 0.30;
    } else {
      const taxable = gross * 0.78;
      inpsAmount = taxable * 0.2607;
      const taxableAfterInps = Math.max(0, taxable - inpsAmount);
      taxAmount = taxableAfterInps * 0.15;
      totalReserve = inpsAmount + taxAmount;
    }

    const netAmount = Math.max(0, gross - totalReserve);
    const effectiveRatePct = gross > 0 ? (totalReserve / gross) * 100 : 0;

    return {
      gross,
      inpsAmount,
      taxAmount,
      totalReserve,
      netAmount,
      effectiveRatePct,
      netRatePct: 100 - effectiveRatePct,
      regime: selRegime
    };
  },

  saveProfile(profile) {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    this.scheduleServerSync();
  },

  // --- Clinics ---
  getClinics() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CLINICS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading clinics', e);
      return [];
    }
  },

  saveClinics(clinics) {
    localStorage.setItem(STORAGE_KEYS.CLINICS, JSON.stringify(clinics));
    this.scheduleServerSync();
  },

  getClinic(id) {
    const clinics = this.getClinics();
    return clinics.find(c => c.id === id) || null;
  },

  saveClinic(clinic) {
    const clinics = this.getClinics();
    const idx = clinics.findIndex(c => c.id === clinic.id);
    if (idx >= 0) {
      clinics[idx] = clinic;
    } else {
      clinics.push(clinic);
    }
    this.saveClinics(clinics);
    return clinic;
  },

  deleteClinic(id) {
    const clinics = this.getClinics().filter(c => c.id !== id);
    this.saveClinics(clinics);
  },

  // --- Shifts ---
  getShifts() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SHIFTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading shifts', e);
      return [];
    }
  },

  saveShifts(shifts) {
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
    this.scheduleServerSync();
  },

  getShift(id) {
    const shifts = this.getShifts();
    return shifts.find(s => s.id === id) || null;
  },

  saveShift(shift) {
    const shifts = this.getShifts();
    const idx = shifts.findIndex(s => s.id === shift.id);
    if (idx >= 0) {
      shifts[idx] = shift;
    } else {
      shifts.push(shift);
    }
    this.saveShifts(shifts);
    return shift;
  },

  deleteShift(id) {
    const shifts = this.getShifts().filter(s => s.id !== id);
    this.saveShifts(shifts);
  },

  // --- Export & Import ---
  exportBackup() {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      profile: this.getProfile(),
      clinics: this.getClinics(),
      shifts: this.getShifts()
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `DentTrack_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  importBackup(fileContent) {
    try {
      const parsed = JSON.parse(fileContent);
      if (parsed.profile) this.saveProfile(parsed.profile);
      if (Array.isArray(parsed.clinics)) this.saveClinics(parsed.clinics);
      if (Array.isArray(parsed.shifts)) this.saveShifts(parsed.shifts);
      return { success: true, countClinics: (parsed.clinics || []).length, countShifts: (parsed.shifts || []).length };
    } catch (e) {
      console.error('Import error', e);
      return { success: false, error: e.message };
    }
  },

  clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.CLINICS);
    localStorage.removeItem(STORAGE_KEYS.SHIFTS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    this.scheduleServerSync();
  },

  // --- Load Sample Data for demonstration ---
  loadSampleData() {
    const sampleProfile = {
      name: 'Dott.ssa Giulia Ferri',
      title: 'Igienista Dentale',
      pIva: '12345678901',
      codFiscale: 'FRRGLI92C55F205K',
      phone: '+39 347 1234567',
      email: 'giulia.ferri.igienista@email.it',
      iban: 'IT60X0542811101000000123456',
      address: 'Milano (MI)',
      taxRegime: 'forfettario_15',
      customTaxRate: 28
    };

    const sampleClinics = [
      {
        id: 'clinic-1',
        name: 'Studio Dentistico Dott. Rossi',
        doctor: 'Dott. Alberto Rossi',
        address: 'Corso Buenos Aires 45, Milano',
        phone: '02 4589632',
        email: 'info@studiorossi.it',
        color: '#0284c7', // Sky blue
        compModel: 'hourly', // 35 €/h
        hourlyRate: 35,
        patientRate: 0,
        percentageRate: 0,
        shiftRate: 0,
        notes: 'Turno fisso martedì e giovedì mattina. Pagamento a 30 gg.'
      },
      {
        id: 'clinic-2',
        name: 'Clinica Odontoiatrica San Marco',
        doctor: 'Dott.ssa Elena Conti (Dir. Sanitario)',
        address: 'Via Garibaldi 18, Monza',
        phone: '039 887766',
        email: 'amministrazione@sanmarcodental.it',
        color: '#0d9488', // Teal
        compModel: 'per_patient', // 30 € a paziente trattato
        hourlyRate: 0,
        patientRate: 30,
        percentageRate: 0,
        shiftRate: 0,
        notes: 'Venerdì giornata intera. Riunito 3 dedicato a igiene.'
      },
      {
        id: 'clinic-3',
        name: 'Centro Medico Dentale Bellini',
        doctor: 'Dott. Marco Bellini',
        address: 'Piazza Duomo 4, Sesto San Giovanni',
        phone: '02 998811',
        email: 'segreteria@bellinidental.it',
        color: '#8b5cf6', // Violet
        compModel: 'percentage', // 45% del listino prestazione
        hourlyRate: 0,
        patientRate: 0,
        percentageRate: 45,
        shiftRate: 0,
        notes: 'Lunedì pomeriggio e sabato mattina alternato. Materiali forniti dallo studio.'
      }
    ];

    // Build realistic shifts for the current month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    const pad = (n) => String(n).padStart(2, '0');
    const makeDateStr = (day) => `${year}-${pad(month + 1)}-${pad(day)}`;

    const sampleShifts = [
      {
        id: 'shift-1',
        clinicId: 'clinic-1',
        date: makeDateStr(2),
        startTime: '08:30',
        endTime: '13:30',
        breakMinutes: 0,
        hoursWorked: 5,
        mode: 'quick',
        quickPlanned: 7,
        quickDone: 6,
        quickCancelled: 1,
        patients: [],
        overrideEarnings: null,
        calculatedEarnings: 175, // 5h * 35€
        notes: 'Paziente delle 11:30 ha disdetto con preavviso.',
        status: 'completed'
      },
      {
        id: 'shift-2',
        clinicId: 'clinic-2',
        date: makeDateStr(5),
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 60,
        hoursWorked: 7,
        mode: 'quick',
        quickPlanned: 9,
        quickDone: 8,
        quickCancelled: 1,
        patients: [],
        overrideEarnings: null,
        calculatedEarnings: 240, // 8 pax * 30€
        notes: 'Ottima affluenza. Un no-show pomeridiano.',
        status: 'completed'
      },
      {
        id: 'shift-3',
        clinicId: 'clinic-3',
        date: makeDateStr(8),
        startTime: '14:00',
        endTime: '19:00',
        breakMinutes: 0,
        hoursWorked: 5,
        mode: 'detailed',
        quickPlanned: 6,
        quickDone: 5,
        quickCancelled: 1,
        patients: [
          { id: 'p1', code: 'A.R.', time: '14:00', treatment: 'Igiene / Detartrasi ordinaria', fee: 80, earnings: 36, status: 'done', notes: 'Recall a 6 mesi' },
          { id: 'p2', code: 'C.M.', time: '15:00', treatment: 'Prima Visita + Igiene', fee: 100, earnings: 45, status: 'done', notes: 'Gengivite da placca' },
          { id: 'p3', code: 'G.B.', time: '16:00', treatment: 'Sbiancamento professionale (LED/Laser)', fee: 250, earnings: 112.5, status: 'done', notes: 'Ottimo risultato scala vita A1' },
          { id: 'p4', code: 'F.T.', time: '17:30', treatment: 'Levigatura radicolare (quadrante)', fee: 110, earnings: 49.5, status: 'done', notes: 'I° quadrante eseguito' },
          { id: 'p5', code: 'L.S.', time: '18:30', treatment: 'Igiene / Detartrasi ordinaria', fee: 80, earnings: 36, status: 'done', notes: '' }
        ],
        overrideEarnings: null,
        calculatedEarnings: 279, // sum of detailed cuts
        notes: 'Pomeriggio intenso con sbiancamento riuscito benissimo.',
        status: 'completed'
      },
      {
        id: 'shift-4',
        clinicId: 'clinic-1',
        date: makeDateStr(12),
        startTime: '08:30',
        endTime: '13:30',
        breakMinutes: 0,
        hoursWorked: 5,
        mode: 'quick',
        quickPlanned: 7,
        quickDone: 7,
        quickCancelled: 0,
        patients: [],
        overrideEarnings: null,
        calculatedEarnings: 175,
        notes: 'Tutti i pazienti presenti e puntuali.',
        status: 'completed'
      },
      {
        id: 'shift-5',
        clinicId: 'clinic-2',
        date: makeDateStr(16),
        startTime: '09:00',
        endTime: '16:30',
        breakMinutes: 30,
        hoursWorked: 7,
        mode: 'quick',
        quickPlanned: 8,
        quickDone: 7,
        quickCancelled: 1,
        patients: [],
        overrideEarnings: null,
        calculatedEarnings: 210, // 7 * 30€
        notes: 'Un paziente con urgenza aggiunto a metà mattina.',
        status: 'completed'
      },
      {
        id: 'shift-6',
        clinicId: 'clinic-3',
        date: makeDateStr(19),
        startTime: '14:00',
        endTime: '19:00',
        breakMinutes: 0,
        hoursWorked: 5,
        mode: 'detailed',
        quickPlanned: 6,
        quickDone: 5,
        quickCancelled: 0,
        patients: [
          { id: 'p6', code: 'P.D.', time: '14:00', treatment: 'Igiene / Detartrasi ordinaria', fee: 80, earnings: 36, status: 'done', notes: '' },
          { id: 'p7', code: 'M.L.', time: '15:00', treatment: 'Levigatura radicolare (quadrante)', fee: 100, earnings: 45, status: 'done', notes: 'III° quadrante' },
          { id: 'p8', code: 'S.P.', time: '16:00', treatment: 'Igiene / Detartrasi ordinaria', fee: 80, earnings: 36, status: 'done', notes: '' },
          { id: 'p9', code: 'E.V.', time: '17:00', treatment: 'Sigillatura dei solchi (a dente)', fee: 80, earnings: 36, status: 'done', notes: '2 molari sigillati' },
          { id: 'p10', code: 'R.N.', time: '18:00', treatment: 'Igiene / Detartrasi ordinaria', fee: 80, earnings: 36, status: 'done', notes: '' }
        ],
        overrideEarnings: null,
        calculatedEarnings: 189,
        notes: '',
        status: 'completed'
      },
      {
        id: 'shift-7',
        clinicId: 'clinic-1',
        date: makeDateStr(23),
        startTime: '08:30',
        endTime: '13:30',
        breakMinutes: 0,
        hoursWorked: 5,
        mode: 'quick',
        quickPlanned: 7,
        quickDone: 6,
        quickCancelled: 1,
        patients: [],
        overrideEarnings: null,
        calculatedEarnings: 175,
        notes: '',
        status: 'completed'
      }
    ];

    this.saveProfile(sampleProfile);
    this.saveClinics(sampleClinics);
    this.saveShifts(sampleShifts);
  },

  // ==========================================
  // --- Central Server Synchronization ---
  // ==========================================
  isServerConnected: false,
  isSyncing: false,
  lastSyncTime: null,
  syncDebounceTimer: null,

  async initServerSync() {
    if (!window.location.protocol.startsWith('http')) {
      this.updateSyncUI('offline', 'Memoria locale (Offline)');
      return;
    }

    try {
      this.updateSyncUI('syncing', 'Controllo server...');
      const apiUrl = window.location.pathname.replace(/\/index\.html.*$/, '').replace(/\/$/, '') + '/api/data';
      const res = await fetch(apiUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const serverData = await res.json();
      this.isServerConnected = true;

      const hasServerContent = serverData && (
        (Array.isArray(serverData.shifts) && serverData.shifts.length > 0) ||
        (Array.isArray(serverData.clinics) && serverData.clinics.length > 0) ||
        (serverData.profile && Object.keys(serverData.profile).length > 0)
      );

      const localClinics = this.getClinics();
      const localShifts = this.getShifts();
      const hasLocalContent = localClinics.length > 0 || localShifts.length > 0;

      if (hasServerContent) {
        // Il server centrale ha dati: li scarichiamo e allineiamo la memoria locale
        if (serverData.profile) localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(serverData.profile));
        if (Array.isArray(serverData.clinics)) localStorage.setItem(STORAGE_KEYS.CLINICS, JSON.stringify(serverData.clinics));
        if (Array.isArray(serverData.shifts)) localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(serverData.shifts));
        this.lastSyncTime = new Date();
        this.updateSyncUI('synced', `Sincronizzato (${this.formatTime(this.lastSyncTime)})`);
        if (window.App && App.refreshAll) App.refreshAll();
      } else if (hasLocalContent) {
        // Il server centrale è appena partito o vuoto: carichiamo i dati locali attuali
        await this.syncToServer(false);
      } else {
        this.updateSyncUI('synced', 'Server collegato');
      }
    } catch (e) {
      console.log('Server sync non disponibile, uso storage locale:', e.message);
      this.isServerConnected = false;
      this.updateSyncUI('offline', 'Memoria locale');
    }
  },

  scheduleServerSync() {
    if (!window.location.protocol.startsWith('http')) return;
    clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      this.syncToServer();
    }, 400);
  },

  async syncToServer(refreshAfter = false) {
    if (!window.location.protocol.startsWith('http')) return;
    this.isSyncing = true;
    this.updateSyncUI('syncing', 'Salvataggio sul server...');

    const payload = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      profile: this.getProfile(),
      clinics: this.getClinics(),
      shifts: this.getShifts()
    };

    try {
      const apiUrl = window.location.pathname.replace(/\/index\.html.*$/, '').replace(/\/$/, '') + '/api/data';
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.isServerConnected = true;
      this.lastSyncTime = new Date();
      this.updateSyncUI('synced', `Sincronizzato (${this.formatTime(this.lastSyncTime)})`);
    } catch (e) {
      console.warn('Errore salvataggio server:', e);
      this.updateSyncUI('offline', 'Salvato in locale (Server non raggiungibile)');
    } finally {
      this.isSyncing = false;
      if (refreshAfter && window.App && App.refreshAll) {
        App.refreshAll();
      }
    }
  },

  formatTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  },

  updateSyncUI(status, label) {
    const el = document.getElementById('sync-status-indicator');
    const badgeEl = document.getElementById('profile-sync-badge');

    let icon = '🟢';
    if (status === 'syncing') icon = '🔄';
    if (status === 'offline') icon = '💾';

    if (el) {
      el.className = `sync-status-badge sync-${status}`;
      el.innerHTML = `<span>${icon}</span> <span>${label}</span>`;
    }

    if (badgeEl) {
      badgeEl.className = `sync-status-badge sync-${status}`;
      badgeEl.innerHTML = `<span>${icon}</span> <span>${label}</span>`;
    }
  }
};
