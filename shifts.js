/**
 * Shifts & Patient Logging Module
 * Handles scheduling, recording actual patients (quick or detailed),
 * calculating hours and earnings.
 */

const ShiftsModule = {
  currentEditId: null,
  detailedPatientsList: [],

  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    const btnNewShift = document.getElementById('btn-new-shift');
    if (btnNewShift) {
      btnNewShift.addEventListener('click', () => this.openModal());
    }

    const formShift = document.getElementById('form-shift');
    if (formShift) {
      formShift.addEventListener('submit', (e) => this.handleSave(e));
    }

    // Clinic selection change -> updates compensation info & defaults
    const clinicSelect = document.getElementById('shift-clinic-id');
    if (clinicSelect) {
      clinicSelect.addEventListener('change', () => this.recalculateEarnings());
    }

    // Time changes -> recalculate hours and earnings
    ['shift-start-time', 'shift-end-time', 'shift-break-mins'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateHoursWorked();
          this.recalculateEarnings();
        });
      }
    });

    // Patient quick inputs -> recalculate earnings
    ['shift-quick-done', 'shift-quick-planned'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.recalculateEarnings());
      }
    });

    // Switch between Quick Mode and Detailed Mode
    const modeQuickRadio = document.getElementById('mode-quick');
    const modeDetailedRadio = document.getElementById('mode-detailed');
    if (modeQuickRadio && modeDetailedRadio) {
      modeQuickRadio.addEventListener('change', () => this.switchMode('quick'));
      modeDetailedRadio.addEventListener('change', () => this.switchMode('detailed'));
    }

    // Add detailed patient button
    const btnAddPatient = document.getElementById('btn-add-patient-row');
    if (btnAddPatient) {
      btnAddPatient.addEventListener('click', () => this.addPatientRow());
    }

    // Shift filters
    const filterClinic = document.getElementById('shift-filter-clinic');
    const filterMonth = document.getElementById('shift-filter-month');
    if (filterClinic) filterClinic.addEventListener('change', () => this.render());
    if (filterMonth) filterMonth.addEventListener('change', () => this.render());

    // Manual earnings change -> update net preview
    const calcEarningsInput = document.getElementById('shift-calculated-earnings');
    if (calcEarningsInput) {
      calcEarningsInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        const netPrev = document.getElementById('shift-net-preview');
        if (netPrev) {
          const taxData = Storage.calculateTaxesAndNet(val);
          netPrev.innerHTML = `Stima Netto in tasca: <strong>~${taxData.netAmount.toFixed(2)} €</strong> &bull; Da accantonare per tasse &amp; INPS (${taxData.effectiveRatePct.toFixed(1)}%): <strong>~${taxData.totalReserve.toFixed(2)} €</strong>`;
        }
      });
    }
  },

  updateClinicDropdowns() {
    const clinics = Storage.getClinics();
    const shiftClinicSelect = document.getElementById('shift-clinic-id');
    const filterClinicSelect = document.getElementById('shift-filter-clinic');

    const optionsHtml = clinics.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');

    if (shiftClinicSelect) {
      shiftClinicSelect.innerHTML = clinics.length ? optionsHtml : '<option value="">-- Nessuno studio disponibile --</option>';
    }

    if (filterClinicSelect) {
      filterClinicSelect.innerHTML = `<option value="">Tutti gli studi</option>` + optionsHtml;
    }
  },

  switchMode(mode) {
    const quickSection = document.getElementById('section-quick-mode');
    const detailedSection = document.getElementById('section-detailed-mode');

    if (mode === 'quick') {
      quickSection.style.display = 'block';
      detailedSection.style.display = 'none';
      document.getElementById('mode-quick').checked = true;
    } else {
      quickSection.style.display = 'none';
      detailedSection.style.display = 'block';
      document.getElementById('mode-detailed').checked = true;
      if (this.detailedPatientsList.length === 0) {
        // If quickDone was set, pre-create rows
        const doneCount = parseInt(document.getElementById('shift-quick-done').value) || 1;
        for (let i = 0; i < Math.min(doneCount, 8); i++) {
          this.addPatientRow({ code: `Paziente ${i + 1}`, treatment: 'Igiene / Detartrasi ordinaria', fee: 80, status: 'done' });
        }
      }
      this.renderPatientRows();
    }
    this.recalculateEarnings();
  },

  updateHoursWorked() {
    const start = document.getElementById('shift-start-time').value;
    const end = document.getElementById('shift-end-time').value;
    const breakMins = parseInt(document.getElementById('shift-break-mins').value) || 0;

    if (!start || !end) {
      document.getElementById('shift-hours-display').textContent = '0 h';
      return 0;
    }

    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);

    let totalMins = (eh * 60 + em) - (sh * 60 + sm) - breakMins;
    if (totalMins < 0) totalMins = 0;

    const hours = (totalMins / 60);
    document.getElementById('shift-hours-display').textContent = `${hours.toFixed(2)} h (${Math.floor(totalMins / 60)}h ${totalMins % 60}m)`;
    return hours;
  },

  recalculateEarnings() {
    const clinicId = document.getElementById('shift-clinic-id').value;
    const clinic = Storage.getClinic(clinicId);
    if (!clinic) return;

    const hours = this.updateHoursWorked();
    const isDetailed = document.getElementById('mode-detailed').checked;
    let earnings = 0;

    if (clinic.compModel === 'hourly') {
      earnings = hours * (clinic.hourlyRate || 0);
      document.getElementById('comp-calc-info').innerHTML = `Calcolo: <strong>${hours.toFixed(2)} h</strong> &times; ${clinic.hourlyRate} €/h = <strong>${earnings.toFixed(2)} €</strong>`;
    } else if (clinic.compModel === 'per_patient') {
      const donePax = isDetailed 
        ? this.detailedPatientsList.filter(p => p.status === 'done').length 
        : (parseInt(document.getElementById('shift-quick-done').value) || 0);
      earnings = donePax * (clinic.patientRate || 0);
      document.getElementById('comp-calc-info').innerHTML = `Calcolo: <strong>${donePax} pazienti</strong> &times; ${clinic.patientRate} €/paz = <strong>${earnings.toFixed(2)} €</strong>`;
    } else if (clinic.compModel === 'percentage') {
      if (isDetailed) {
        earnings = this.detailedPatientsList
          .filter(p => p.status === 'done')
          .reduce((acc, p) => acc + (parseFloat(p.earnings) || 0), 0);
        document.getElementById('comp-calc-info').innerHTML = `Calcolo: <strong>${clinic.percentageRate}%</strong> sulla somma dei trattamenti = <strong>${earnings.toFixed(2)} €</strong>`;
      } else {
        const donePax = parseInt(document.getElementById('shift-quick-done').value) || 0;
        // Estimated: standard 80€ fee
        const estimatedFeeTotal = donePax * 80;
        earnings = (estimatedFeeTotal * (clinic.percentageRate || 0)) / 100;
        document.getElementById('comp-calc-info').innerHTML = `Calcolo stima (${donePax} pax &times; 80€ &times; ${clinic.percentageRate}%): <strong>${earnings.toFixed(2)} €</strong>`;
      }
    } else if (clinic.compModel === 'fixed_shift') {
      earnings = clinic.shiftRate || 0;
      document.getElementById('comp-calc-info').innerHTML = `Compenso fisso a turno: <strong>${earnings.toFixed(2)} €</strong>`;
    }

    document.getElementById('shift-calculated-earnings').value = earnings.toFixed(2);

    const netPrev = document.getElementById('shift-net-preview');
    if (netPrev) {
      const taxData = Storage.calculateTaxesAndNet(earnings);
      netPrev.innerHTML = `Stima Netto in tasca: <strong>~${taxData.netAmount.toFixed(2)} €</strong> &bull; Da accantonare per tasse &amp; INPS (${taxData.effectiveRatePct.toFixed(1)}%): <strong>~${taxData.totalReserve.toFixed(2)} €</strong>`;
    }
  },

  // Detailed Patients Row handling
  addPatientRow(data = null) {
    const clinicId = document.getElementById('shift-clinic-id').value;
    const clinic = Storage.getClinic(clinicId);
    const percentage = clinic && clinic.compModel === 'percentage' ? clinic.percentageRate : 40;
    const patientRate = clinic && clinic.compModel === 'per_patient' ? clinic.patientRate : 30;

    const defaultFee = 80;
    let initialEarnings = 32;
    if (clinic && clinic.compModel === 'percentage') {
      initialEarnings = (defaultFee * percentage) / 100;
    } else if (clinic && clinic.compModel === 'per_patient') {
      initialEarnings = patientRate;
    }

    const patient = data || {
      id: 'p-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      code: '',
      time: '',
      treatment: 'Igiene / Detartrasi ordinaria',
      fee: defaultFee,
      earnings: initialEarnings,
      status: 'done',
      notes: ''
    };

    this.detailedPatientsList.push(patient);
    this.renderPatientRows();
    this.recalculateEarnings();
  },

  removePatientRow(index) {
    this.detailedPatientsList.splice(index, 1);
    this.renderPatientRows();
    this.recalculateEarnings();
  },

  renderPatientRows() {
    const container = document.getElementById('detailed-patients-container');
    if (!container) return;

    if (this.detailedPatientsList.length === 0) {
      container.innerHTML = `<div class="empty-hint">Nessun paziente inserito. Clicca su "+ Aggiungi Paziente" per inserire le singole prestazioni.</div>`;
      return;
    }

    const treatmentOptions = DEFAULT_TREATMENTS.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    container.innerHTML = this.detailedPatientsList.map((p, idx) => `
      <div class="patient-row ${p.status !== 'done' ? 'patient-row-cancelled' : ''}" data-idx="${idx}">
        <div class="patient-col col-time">
          <input type="time" class="form-control" value="${p.time || ''}" placeholder="Ora" onchange="ShiftsModule.updatePatientField(${idx}, 'time', this.value)">
        </div>
        <div class="patient-col col-code">
          <input type="text" class="form-control" value="${this.escapeHtml(p.code || '')}" placeholder="Iniziali/Nome (es. M.R.)" onchange="ShiftsModule.updatePatientField(${idx}, 'code', this.value)">
        </div>
        <div class="patient-col col-treatment">
          <select class="form-control" onchange="ShiftsModule.updatePatientTreatment(${idx}, this.value)">
            ${DEFAULT_TREATMENTS.map(t => `<option value="${t.name}" ${p.treatment === t.name ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
        </div>
        <div class="patient-col col-fee">
          <input type="number" step="0.5" class="form-control" value="${p.fee}" placeholder="Tariffa €" oninput="ShiftsModule.updatePatientFee(${idx}, this.value)">
        </div>
        <div class="patient-col col-earnings">
          <input type="number" step="0.5" class="form-control" value="${p.earnings}" placeholder="Tuo compenso €" oninput="ShiftsModule.updatePatientField(${idx}, 'earnings', parseFloat(this.value)||0)">
        </div>
        <div class="patient-col col-status">
          <select class="form-control form-control-sm" onchange="ShiftsModule.updatePatientField(${idx}, 'status', this.value)">
            <option value="done" ${p.status === 'done' ? 'selected' : ''}>✅ Fatto</option>
            <option value="cancelled" ${p.status === 'cancelled' ? 'selected' : ''}>❌ Disdetta</option>
            <option value="noshow" ${p.status === 'noshow' ? 'selected' : ''}>⚠️ No-Show</option>
          </select>
        </div>
        <div class="patient-col col-action">
          <button type="button" class="btn-icon btn-icon-danger" title="Rimuovi" onclick="ShiftsModule.removePatientRow(${idx})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
    `).join('');
  },

  updatePatientField(idx, field, value) {
    if (this.detailedPatientsList[idx]) {
      this.detailedPatientsList[idx][field] = value;
      this.recalculateEarnings();
    }
  },

  updatePatientTreatment(idx, treatmentName) {
    const t = DEFAULT_TREATMENTS.find(item => item.name === treatmentName);
    const p = this.detailedPatientsList[idx];
    if (p) {
      p.treatment = treatmentName;
      if (t) {
        p.fee = t.defaultFee;
        const clinicId = document.getElementById('shift-clinic-id').value;
        const clinic = Storage.getClinic(clinicId);
        if (clinic && clinic.compModel === 'percentage') {
          p.earnings = (t.defaultFee * clinic.percentageRate) / 100;
        } else if (clinic && clinic.compModel === 'per_patient') {
          p.earnings = clinic.patientRate;
        } else {
          p.earnings = t.defaultCut;
        }
      }
      this.renderPatientRows();
      this.recalculateEarnings();
    }
  },

  updatePatientFee(idx, feeVal) {
    const p = this.detailedPatientsList[idx];
    if (p) {
      const fee = parseFloat(feeVal) || 0;
      p.fee = fee;
      const clinicId = document.getElementById('shift-clinic-id').value;
      const clinic = Storage.getClinic(clinicId);
      if (clinic && clinic.compModel === 'percentage') {
        p.earnings = (fee * clinic.percentageRate) / 100;
      }
      this.renderPatientRows();
      this.recalculateEarnings();
    }
  },

  openModal(shiftId = null, prefillDate = null) {
    const clinics = Storage.getClinics();
    if (clinics.length === 0) {
      alert('Prima di inserire un turno lavorativo, aggiungi almeno uno Studio Dentistico nella sezione "Studi".');
      ClinicsModule.openModal();
      return;
    }

    const modal = document.getElementById('modal-shift');
    const form = document.getElementById('form-shift');
    const title = document.getElementById('modal-shift-title');
    if (!modal || !form) return;

    form.reset();
    this.updateClinicDropdowns();
    this.currentEditId = shiftId;

    if (shiftId) {
      const shift = Storage.getShift(shiftId);
      if (!shift) return;

      title.textContent = 'Modifica Turno / Presenza';
      document.getElementById('shift-id').value = shift.id;
      document.getElementById('shift-clinic-id').value = shift.clinicId;
      document.getElementById('shift-date').value = shift.date;
      document.getElementById('shift-start-time').value = shift.startTime;
      document.getElementById('shift-end-time').value = shift.endTime;
      document.getElementById('shift-break-mins').value = shift.breakMinutes || 0;
      document.getElementById('shift-status').value = shift.status || 'completed';
      document.getElementById('shift-notes').value = shift.notes || '';

      document.getElementById('shift-quick-planned').value = shift.quickPlanned ?? 8;
      document.getElementById('shift-quick-done').value = shift.quickDone ?? 7;
      document.getElementById('shift-quick-cancelled').value = shift.quickCancelled ?? 0;

      this.detailedPatientsList = Array.isArray(shift.patients) ? JSON.parse(JSON.stringify(shift.patients)) : [];
      this.switchMode(shift.mode || 'quick');

      if (shift.overrideEarnings) {
        document.getElementById('shift-calculated-earnings').value = shift.overrideEarnings;
      }
    } else {
      title.textContent = 'Nuovo Turno / Presenza';
      document.getElementById('shift-id').value = '';
      const todayStr = prefillDate || new Date().toISOString().slice(0, 10);
      document.getElementById('shift-date').value = todayStr;
      document.getElementById('shift-start-time').value = '08:30';
      document.getElementById('shift-end-time').value = '13:30';
      document.getElementById('shift-break-mins').value = '0';
      document.getElementById('shift-status').value = 'completed';
      document.getElementById('shift-notes').value = '';

      document.getElementById('shift-quick-planned').value = '8';
      document.getElementById('shift-quick-done').value = '7';
      document.getElementById('shift-quick-cancelled').value = '1';

      this.detailedPatientsList = [];
      this.switchMode('quick');
    }

    this.updateHoursWorked();
    this.recalculateEarnings();
    modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('modal-shift');
    if (modal) modal.classList.remove('active');
  },

  handleSave(e) {
    e.preventDefault();
    const id = document.getElementById('shift-id').value || 'shift-' + Date.now();
    const clinicId = document.getElementById('shift-clinic-id').value;
    const date = document.getElementById('shift-date').value;
    const startTime = document.getElementById('shift-start-time').value;
    const endTime = document.getElementById('shift-end-time').value;
    const breakMinutes = parseInt(document.getElementById('shift-break-mins').value) || 0;
    const mode = document.getElementById('mode-detailed').checked ? 'detailed' : 'quick';

    if (!clinicId) {
      alert('Seleziona uno studio dentistico.');
      return;
    }
    if (!date) {
      alert('Seleziona la data del turno.');
      return;
    }

    const hoursWorked = this.updateHoursWorked();

    let quickPlanned = parseInt(document.getElementById('shift-quick-planned').value) || 0;
    let quickDone = parseInt(document.getElementById('shift-quick-done').value) || 0;
    let quickCancelled = parseInt(document.getElementById('shift-quick-cancelled').value) || 0;

    if (mode === 'detailed') {
      quickPlanned = this.detailedPatientsList.length;
      quickDone = this.detailedPatientsList.filter(p => p.status === 'done').length;
      quickCancelled = this.detailedPatientsList.filter(p => p.status !== 'done').length;
    }

    const calculatedEarnings = parseFloat(document.getElementById('shift-calculated-earnings').value) || 0;

    const shift = {
      id,
      clinicId,
      date,
      startTime,
      endTime,
      breakMinutes,
      hoursWorked,
      mode,
      quickPlanned,
      quickDone,
      quickCancelled,
      patients: mode === 'detailed' ? this.detailedPatientsList : [],
      calculatedEarnings,
      overrideEarnings: null,
      notes: document.getElementById('shift-notes').value.trim(),
      status: document.getElementById('shift-status').value
    };

    Storage.saveShift(shift);
    this.closeModal();
    this.render();

    if (window.App) App.refreshAll();
  },

  render() {
    const container = document.getElementById('shifts-list-table-body');
    if (!container) return;

    const filterClinic = document.getElementById('shift-filter-clinic') ? document.getElementById('shift-filter-clinic').value : '';
    const filterMonth = document.getElementById('shift-filter-month') ? document.getElementById('shift-filter-month').value : '';

    let shifts = Storage.getShifts();

    if (filterClinic) {
      shifts = shifts.filter(s => s.clinicId === filterClinic);
    }

    if (filterMonth) {
      shifts = shifts.filter(s => s.date.startsWith(filterMonth));
    }

    // Sort descending by date
    shifts.sort((a, b) => b.date.localeCompare(a.date));

    if (shifts.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-8 text-muted">
            Nessun turno trovato con i filtri selezionati.
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = shifts.map(s => {
      const clinic = Storage.getClinic(s.clinicId) || { name: 'Studio rimosso', color: '#94a3b8' };
      const dateFormatted = new Date(s.date + 'T00:00:00').toLocaleDateString('it-IT', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      });

      const paxCount = s.mode === 'detailed'
        ? `${s.patients.filter(p => p.status === 'done').length} fatti (${s.patients.length} tot)`
        : `${s.quickDone} fatti su ${s.quickPlanned}`;

      return `
        <tr>
          <td><strong>${dateFormatted}</strong></td>
          <td>
            <span class="badge-clinic" style="background-color: ${clinic.color}15; color: ${clinic.color}; border: 1px solid ${clinic.color}40">
              <span class="color-dot-sm" style="background-color: ${clinic.color}"></span>
              ${this.escapeHtml(clinic.name)}
            </span>
          </td>
          <td>${s.startTime} - ${s.endTime} (${s.hoursWorked.toFixed(1)} h)</td>
          <td>
            <span class="badge-pax">${paxCount}</span>
            ${s.mode === 'detailed' ? '<span class="badge-tag">Dettagliato</span>' : ''}
          </td>
          <td>
            <strong>${(s.calculatedEarnings || 0).toFixed(2)} €</strong>
            <div class="sub-detail" style="color: #15803d; font-weight: 500;">Netto: ~${Storage.calculateTaxesAndNet(s.calculatedEarnings || 0).netAmount.toFixed(0)} €</div>
          </td>
          <td><span class="status-pill status-${s.status}">${s.status === 'completed' ? 'Svolto' : 'Programmato'}</span></td>
          <td class="text-right">
            <button class="btn-icon" title="Modifica" onclick="ShiftsModule.openModal('${s.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Elimina" onclick="ShiftsModule.confirmDelete('${s.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  confirmDelete(id) {
    if (confirm('Sei sicura di voler eliminare questo turno?')) {
      Storage.deleteShift(id);
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
