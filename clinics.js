/**
 * Clinics Management Module
 * Handles creation, editing, deletion and compensation rules for dental clinics.
 */

const ClinicsModule = {
  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    const btnNewClinic = document.getElementById('btn-new-clinic');
    if (btnNewClinic) {
      btnNewClinic.addEventListener('click', () => this.openModal());
    }

    const formClinic = document.getElementById('form-clinic');
    if (formClinic) {
      formClinic.addEventListener('submit', (e) => this.handleSave(e));
    }

    const compModelSelect = document.getElementById('clinic-comp-model');
    if (compModelSelect) {
      compModelSelect.addEventListener('change', (e) => this.updateCompModelFields(e.target.value));
    }

    const colorPickerContainer = document.getElementById('clinic-color-picker');
    if (colorPickerContainer) {
      colorPickerContainer.addEventListener('click', (e) => {
        const target = e.target.closest('.color-swatch');
        if (target) {
          document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
          target.classList.add('active');
          document.getElementById('clinic-color').value = target.dataset.color;
        }
      });
    }
  },

  render() {
    const container = document.getElementById('clinics-list');
    if (!container) return;

    const clinics = Storage.getClinics();
    if (clinics.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏥</div>
          <h3>Nessuno studio registrato</h3>
          <p>Aggiungi il primo studio dentistico in cui collabori per iniziare a registrare i turni e monitorare i tuoi compensi.</p>
          <button class="btn btn-primary" onclick="ClinicsModule.openModal()">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Aggiungi Studio
          </button>
        </div>
      `;
      return;
    }

    const shifts = Storage.getShifts();

    container.innerHTML = clinics.map(clinic => {
      // Calculate total shifts and earnings for this clinic
      const clinicShifts = shifts.filter(s => s.clinicId === clinic.id);
      const totalHours = clinicShifts.reduce((acc, s) => acc + (s.hoursWorked || 0), 0);
      const totalPatients = clinicShifts.reduce((acc, s) => {
        if (s.mode === 'detailed' && s.patients) {
          return acc + s.patients.filter(p => p.status === 'done').length;
        }
        return acc + (s.quickDone || 0);
      }, 0);

      const compLabel = this.getCompDescription(clinic);

      return `
        <div class="clinic-card" style="border-top-color: ${clinic.color}">
          <div class="clinic-header">
            <div class="clinic-title-row">
              <span class="color-dot" style="background-color: ${clinic.color}"></span>
              <h3 class="clinic-name">${this.escapeHtml(clinic.name)}</h3>
            </div>
            <div class="clinic-actions">
              <button class="btn-icon" title="Modifica Studio" onclick="ClinicsModule.openModal('${clinic.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn-icon btn-icon-danger" title="Elimina Studio" onclick="ClinicsModule.confirmDelete('${clinic.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>

          <div class="clinic-details">
            ${clinic.doctor ? `<div class="detail-item"><span class="label">Referente:</span> ${this.escapeHtml(clinic.doctor)}</div>` : ''}
            ${clinic.address ? `<div class="detail-item"><span class="label">Indirizzo:</span> ${this.escapeHtml(clinic.address)}</div>` : ''}
            ${clinic.phone ? `<div class="detail-item"><span class="label">Telefono:</span> <a href="tel:${clinic.phone}">${this.escapeHtml(clinic.phone)}</a></div>` : ''}
            ${clinic.email ? `<div class="detail-item"><span class="label">Email:</span> ${this.escapeHtml(clinic.email)}</div>` : ''}
            
            <div class="comp-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
              <span><strong>Compenso:</strong> ${compLabel}</span>
            </div>

            ${clinic.notes ? `<div class="clinic-notes"><em>"${this.escapeHtml(clinic.notes)}"</em></div>` : ''}
          </div>

          <div class="clinic-stats-footer">
            <div class="stat-pill">
              <span class="num">${clinicShifts.length}</span>
              <span class="txt">Turni</span>
            </div>
            <div class="stat-pill">
              <span class="num">${totalHours.toFixed(1)} h</span>
              <span class="txt">Ore totali</span>
            </div>
            <div class="stat-pill">
              <span class="num">${totalPatients}</span>
              <span class="txt">Pazienti fatti</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  getCompDescription(clinic) {
    switch (clinic.compModel) {
      case 'hourly':
        return `${Number(clinic.hourlyRate || 0).toFixed(2)} € / ora`;
      case 'per_patient':
        return `${Number(clinic.patientRate || 0).toFixed(2)} € a paziente trattato`;
      case 'percentage':
        return `${clinic.percentageRate || 0}% sul valore della prestazione`;
      case 'fixed_shift':
        return `${Number(clinic.shiftRate || 0).toFixed(2)} € a turno fisso`;
      case 'custom_rate':
        return `Tariffario specifico per prestazione`;
      default:
        return 'Non impostato';
    }
  },

  openModal(clinicId = null) {
    const modal = document.getElementById('modal-clinic');
    const form = document.getElementById('form-clinic');
    const title = document.getElementById('modal-clinic-title');
    if (!modal || !form) return;

    form.reset();

    // Render color swatches
    const colorPicker = document.getElementById('clinic-color-picker');
    colorPicker.innerHTML = CLINIC_COLORS.map(c => `
      <div class="color-swatch" data-color="${c}" style="background-color: ${c}"></div>
    `).join('');

    if (clinicId) {
      const clinic = Storage.getClinic(clinicId);
      if (!clinic) return;

      title.textContent = 'Modifica Studio Dentistico';
      document.getElementById('clinic-id').value = clinic.id;
      document.getElementById('clinic-name').value = clinic.name;
      document.getElementById('clinic-doctor').value = clinic.doctor || '';
      document.getElementById('clinic-address').value = clinic.address || '';
      document.getElementById('clinic-phone').value = clinic.phone || '';
      document.getElementById('clinic-email').value = clinic.email || '';
      document.getElementById('clinic-color').value = clinic.color || CLINIC_COLORS[0];
      document.getElementById('clinic-comp-model').value = clinic.compModel || 'hourly';
      document.getElementById('clinic-hourly-rate').value = clinic.hourlyRate || '';
      document.getElementById('clinic-patient-rate').value = clinic.patientRate || '';
      document.getElementById('clinic-percentage-rate').value = clinic.percentageRate || '';
      document.getElementById('clinic-shift-rate').value = clinic.shiftRate || '';
      document.getElementById('clinic-notes').value = clinic.notes || '';

      this.updateCompModelFields(clinic.compModel || 'hourly');
      this.selectColorSwatch(clinic.color || CLINIC_COLORS[0]);
    } else {
      title.textContent = 'Nuovo Studio Dentistico';
      document.getElementById('clinic-id').value = '';
      document.getElementById('clinic-color').value = CLINIC_COLORS[0];
      document.getElementById('clinic-comp-model').value = 'hourly';
      document.getElementById('clinic-hourly-rate').value = '35';
      this.updateCompModelFields('hourly');
      this.selectColorSwatch(CLINIC_COLORS[0]);
    }

    modal.classList.add('active');
  },

  selectColorSwatch(color) {
    document.querySelectorAll('.color-swatch').forEach(s => {
      if (s.dataset.color.toLowerCase() === color.toLowerCase()) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
  },

  updateCompModelFields(model) {
    document.getElementById('comp-group-hourly').style.display = model === 'hourly' ? 'block' : 'none';
    document.getElementById('comp-group-patient').style.display = model === 'per_patient' ? 'block' : 'none';
    document.getElementById('comp-group-percentage').style.display = model === 'percentage' ? 'block' : 'none';
    document.getElementById('comp-group-shift').style.display = model === 'fixed_shift' ? 'block' : 'none';
  },

  closeModal() {
    const modal = document.getElementById('modal-clinic');
    if (modal) modal.classList.remove('active');
  },

  handleSave(e) {
    e.preventDefault();
    const id = document.getElementById('clinic-id').value || 'clinic-' + Date.now();
    const name = document.getElementById('clinic-name').value.trim();
    if (!name) {
      alert('Inserisci il nome dello studio dentistico.');
      return;
    }

    const clinic = {
      id,
      name,
      doctor: document.getElementById('clinic-doctor').value.trim(),
      address: document.getElementById('clinic-address').value.trim(),
      phone: document.getElementById('clinic-phone').value.trim(),
      email: document.getElementById('clinic-email').value.trim(),
      color: document.getElementById('clinic-color').value || CLINIC_COLORS[0],
      compModel: document.getElementById('clinic-comp-model').value,
      hourlyRate: parseFloat(document.getElementById('clinic-hourly-rate').value) || 0,
      patientRate: parseFloat(document.getElementById('clinic-patient-rate').value) || 0,
      percentageRate: parseFloat(document.getElementById('clinic-percentage-rate').value) || 0,
      shiftRate: parseFloat(document.getElementById('clinic-shift-rate').value) || 0,
      notes: document.getElementById('clinic-notes').value.trim()
    };

    Storage.saveClinic(clinic);
    this.closeModal();
    this.render();

    // Trigger update in Calendar and Shifts dropdowns
    if (window.App) App.refreshAll();
  },

  confirmDelete(id) {
    const clinic = Storage.getClinic(id);
    if (!clinic) return;

    const shifts = Storage.getShifts().filter(s => s.clinicId === id);
    let msg = `Sei sicura di voler eliminare lo studio "${clinic.name}"?`;
    if (shifts.length > 0) {
      msg += `\nAttenzione: ci sono ${shifts.length} turni associati a questo studio.`;
    }

    if (confirm(msg)) {
      Storage.deleteClinic(id);
      this.render();
      if (window.App) App.refreshAll();
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
};
