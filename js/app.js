// Estrutura persistida em localStorage por usuário:
// users: { [email]: { passwordHash, schools: { [schoolId]: { name, days, slots, teachers, classes, linked, schedules } } } }

const LS_KEY = "schoolSchedulerUsers";

// ===== Utilidades =====
const hash = async (str) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};
const isIntervalo = (s) => s.toLowerCase().includes("intervalo");
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const nowIso = () => new Date().toISOString().replace("T", " ").slice(0, 19);

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveUsers(users) { localStorage.setItem(LS_KEY, JSON.stringify(users)); }

let currentUserEmail = null;
let currentSchoolId = null;

// ===== UI Bindings =====
window.addEventListener("DOMContentLoaded", () => {
  // Auth
  document.getElementById("btnCreateAdmin").addEventListener("click", createAdmin);
  document.getElementById("btnLogin").addEventListener("click", login);
  document.getElementById("btnLogout").addEventListener("click", logout);

  // Schools
  document.getElementById("btnAddSchool").addEventListener("click", addSchool);
  document.getElementById("btnExportSchoolsTxt").addEventListener("click", exportSchoolsTxt);
  document.getElementById("importSchoolsTxt").addEventListener("change", importSchoolsTxt);

  // Week config
  document.getElementById("btnApplyWeek").addEventListener("click", applyWeekConfig);

  // Registry (teachers/classes/link subjects)
  document.getElementById("btnAddTeacher").addEventListener("click", addTeacher);
  document.getElementById("btnExportTeachersTxt").addEventListener("click", exportTeachersTxt);
  document.getElementById("importTeachersTxt").addEventListener("change", importTeachersTxt);

  document.getElementById("btnAddClass").addEventListener("click", addClass);
  document.getElementById("btnExportClassesTxt").addEventListener("click", exportClassesTxt);
  document.getElementById("importClassesTxt").addEventListener("change", importClassesTxt);
  document.getElementById("btnLinkSubject").addEventListener("click", linkSubjectToClass);

  // Scheduling
  document.getElementById("btnGenerateSchedule").addEventListener("click", generateSchedule);
  document.getElementById("btnSaveSchedule").addEventListener("click", saveScheduleVersion);
  document.getElementById("btnLoadSchedule").addEventListener("click", loadLatestSchedule);
  document.getElementById("btnExportExcel").addEventListener("click", exportExcel);
});

// ===== Autenticação =====
async function createAdmin() {
  const email = document.getElementById("adminEmail").value.trim();
  const pass = document.getElementById("adminPassword").value;
  if (!email || !pass) return alert("Preencha e-mail e senha.");
  const users = loadUsers();
  if (users[email]) return alert("Usuário já existe.");
  users[email] = { passwordHash: await hash(pass), schools: {} };
  saveUsers(users);
  alert("Administrador criado!");
}

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value;
  const users = loadUsers();
  if (!users[email]) return alert("Usuário não encontrado.");
  const ok = users[email].passwordHash === await hash(pass);
  if (!ok) return alert("Senha incorreta.");
  currentUserEmail = email;
  document.getElementById("auth").classList.add("hidden");
  document.getElementById("schools").classList.remove("hidden");
  document.getElementById("authStatus").textContent = "";
  renderSchools();
}

function logout() {
  currentUserEmail = null;
  currentSchoolId = null;
  document.getElementById("auth").classList.remove("hidden");
  document.getElementById("schools").classList.add("hidden");
  document.getElementById("weekConfig").classList.add("hidden");
  document.getElementById("registry").classList.add("hidden");
  document.getElementById("scheduling").classList.add("hidden");
}

// ===== Escolas =====
function renderSchools() {
  const users = loadUsers();
  const schools = users[currentUserEmail].schools;
  const container = document.getElementById("schoolsList");
  container.innerHTML = "";

  const listDiv = document.createElement("div");
  listDiv.className = "list";

  Object.entries(schools).forEach(([id, sch]) => {
    const row = document.createElement("div");
    row.className = "row";
    const btnSelect = document.createElement("button");
    btnSelect.textContent = `Selecionar: ${sch.name}`;
    btnSelect.addEventListener("click", () => selectSchool(id));
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Excluir";
    btnDelete.style.background = "#b00020";
    btnDelete.addEventListener("click", () => deleteSchool(id));
    row.appendChild(btnSelect);
    row.appendChild(btnDelete);
    listDiv.appendChild(row);
  });

  container.appendChild(listDiv);
}

function addSchool() {
  const name = document.getElementById("schoolName").value.trim();
  if (!name) return alert("Informe o nome da escola.");
  const users = loadUsers();
  const id = uuid();
  users[currentUserEmail].schools[id] = {
    name,
    days: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    slots: ["07:00-07:50", "07:50-08:40", "08:40-09:30", "Intervalo", "09:50-10:40", "10:40-11:30"],
    teachers: [], // [{ name, subjects: [] }]
    classes: [],  // [{ name }]
    linked: {},   // { [className]: [{ subject, teacher, weekly }] }
    schedules: [] // [{ savedAt, grid }]
  };
  saveUsers(users);
  document.getElementById("schoolName").value = "";
  renderSchools();
}

function deleteSchool(id) {
  const users = loadUsers();
  delete users[currentUserEmail].schools[id];
  saveUsers(users);
  if (currentSchoolId === id) {
    currentSchoolId = null;
    document.getElementById("weekConfig").classList.add("hidden");
    document.getElementById("registry").classList.add("hidden");
    document.getElementById("scheduling").classList.add("hidden");
  }
  renderSchools();
}

function selectSchool(id) {
  currentSchoolId = id;
  document.getElementById("weekConfig").classList.remove("hidden");
  document.getElementById("registry").classList.remove("hidden");
  document.getElementById("scheduling").classList.remove("hidden");
  renderSchoolData();
}

function getCurrentSchool() {
  const users = loadUsers();
  return users[currentUserEmail].schools[currentSchoolId];
}

function saveCurrentSchool(school) {
  const users = loadUsers();
  users[currentUserEmail].schools[currentSchoolId] = school;
  saveUsers(users);
}

// Export/Import escolas (nome + config básica)
function exportSchoolsTxt() {
  const users = loadUsers();
  const schools = users[currentUserEmail].schools;
  // Formato: id|name|dias;d1,d2,...|slots;s1,s2,...
  const lines = Object.entries(schools).map(([id, sch]) =>
    `${id}|${sch.name}|dias;${sch.days.join(",")}|slots;${sch.slots.join(",")}`
  );
  downloadTxt(lines.join("\n"), "escolas.txt");
}
function importSchoolsTxt(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const users = loadUsers();
    const lines = reader.result.split("\n").map(l => l.trim()).filter(l => l);
    lines.forEach(line => {
      const [id, name, diasSeg, slotsSeg] = line.split("|");
      const days = (diasSeg.split(";")[1] || "").split(",").map(s => s.trim()).filter(Boolean);
      const slots = (slotsSeg.split(";")[1] || "").split(",").map(s => s.trim()).filter(Boolean);
      users[currentUserEmail].schools[id] = {
        name, days: days.length ? days : ["Segunda","Terça","Quarta","Quinta","Sexta"],
        slots: slots.length ? slots : ["07:00-07:50","07:50-08:40","08:40-09:30","Intervalo","09:50-10:40","10:40-11:30"],
        teachers: [], classes: [], linked: {}, schedules: []
      };
    });
    saveUsers(users);
    renderSchools();
    alert("Escolas importadas!");
  };
  reader.readAsText(file);
}

// ===== Configuração semana =====
function renderSchoolData() {
  const sch = getCurrentSchool();
  document.getElementById("daysInput").value = sch.days.join(",");
  document.getElementById("slotsInput").value = sch.slots.join(",");
  renderTeachers();
  renderClasses();
  renderLinks();
  renderSavedSchedules();
}

function applyWeekConfig() {
  const sch = getCurrentSchool();
  const days = document.getElementById("daysInput").value.split(",").map(s => s.trim()).filter(Boolean);
  const slots = document.getElementById("slotsInput").value.split(",").map(s => s.trim()).filter(Boolean);
  if (!days.length || !slots.length) return alert("Dias e horários não podem ser vazios.");
  sch.days = days;
  sch.slots = slots;
  saveCurrentSchool(sch);
  alert("Configuração aplicada.");
}

// ===== Professores =====
function addTeacher() {
  const sch = getCurrentSchool();
  const name = document.getElementById("teacherName").value.trim();
  const subjectsStr = document.getElementById("teacherSubjects").value.trim();
  if (!name) return alert("Informe o nome.");
  const subjects = subjectsStr ? subjectsStr.split(",").map(s => s.trim()).filter(Boolean) : [];
  sch.teachers.push({ name, subjects });
  saveCurrentSchool(sch);
  document.getElementById("teacherName").value = "";
  document.getElementById("teacherSubjects").value = "";
  renderTeachers();
}

function renderTeachers() {
  const sch = getCurrentSchool();
  const list = document.getElementById("teachersList");
  list.innerHTML = "";
  const div = document.createElement("div");
  div.className = "list";
  sch.teachers.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<strong>${t.name}</strong> — ${t.subjects.join(", ") || "Sem matérias"}`;
    const btnDel = document.createElement("button");
    btnDel.textContent = "Remover";
    btnDel.style.background = "#b00020";
    btnDel.addEventListener("click", () => {
      sch.teachers.splice(idx, 1);
      saveCurrentSchool(sch);
      renderTeachers();
    });
    row.appendChild(btnDel);
    div.appendChild(row);
  });
  list.appendChild(div);
}

function exportTeachersTxt() {
  const sch = getCurrentSchool();
  // Nome;Matéria1,Matéria2
  const lines = sch.teachers.map(t => `${t.name};${t.subjects.join(",")}`);
  downloadTxt(lines.join("\n"), `professores_${sch.name}.txt`);
}
function importTeachersTxt(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const sch = getCurrentSchool();
    const lines = reader.result.split("\n").map(l => l.trim()).filter(l => l);
    sch.teachers = lines.map(l => {
      const [name, subs] = l.split(";");
      return { name: (name || "").trim(), subjects: (subs || "").split(",").map(s => s.trim()).filter(Boolean) };
    });
    saveCurrentSchool(sch);
    renderTeachers();
    alert("Professores importados!");
  };
  reader.readAsText(file);
}

// ===== Turmas =====
function addClass() {
  const sch = getCurrentSchool();
  const name = document.getElementById("className").value.trim();
  if (!name) return alert("Informe a turma.");
  if (sch.classes.find(c => c.name === name)) return alert("Turma já existe.");
  sch.classes.push({ name });
  sch.linked[name] = sch.linked[name] || [];
  saveCurrentSchool(sch);
  document.getElementById("className").value = "";
  renderClasses();
  renderLinks();
}

function renderClasses() {
  const sch = getCurrentSchool();
  const list = document.getElementById("classesList");
  const selector = document.getElementById("classSelector");
  list.innerHTML = "";
  selector.innerHTML = "";

  const div = document.createElement("div");
  div.className = "list";

  sch.classes.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<strong>${c.name}</strong>`;
    const btnDel = document.createElement("button");
    btnDel.textContent = "Remover";
    btnDel.style.background = "#b00020";
    btnDel.addEventListener("click", () => {
      // remove turma e vínculos
      sch.classes.splice(idx, 1);
      delete sch.linked[c.name];
      saveCurrentSchool(sch);
      renderClasses();
      renderLinks();
    });
    row.appendChild(btnDel);
    div.appendChild(row);

    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    selector.appendChild(opt);
  });

  list.appendChild(div);
}

// ===== Vincular matéria/professor/aulas à turma =====
function linkSubjectToClass() {
  const sch = getCurrentSchool();
  const className = document.getElementById("classSelector").value;
  const subject = document.getElementById("subjectName").value.trim();
  const teacher = document.getElementById("subjectTeacher").value.trim();
  const weekly = parseInt(document.getElementById("subjectWeekly").value, 10);

  if (!className || !subject || !teacher || !(weekly > 0)) return alert("Preencha turma, matéria, professor e aulas/semana.");
  sch.linked[className] = sch.linked[className] || [];
  sch.linked[className].push({ subject, teacher, weekly });
  saveCurrentSchool(sch);
  document.getElementById("subjectName").value = "";
  document.getElementById("subjectTeacher").value = "";
  document.getElementById("subjectWeekly").value = "";
  renderLinks();
}

function renderLinks() {
  const sch = getCurrentSchool();
  const container = document.getElementById("classesList");
  const existing = container.querySelector(".links");
  if (existing) existing.remove();

  const linksDiv = document.createElement("div");
  linksDiv.className = "links";

  sch.classes.forEach(c => {
    const card = document.createElement("div");
    card.className = "card";
    const header = document.createElement("h4");
    header.textContent = `Matérias da turma ${c.name}`;
    card.appendChild(header);

    const list = document.createElement("div");
    list.className = "list";
    (sch.linked[c.name] || []).forEach((lnk, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `${lnk.subject} — ${lnk.teacher} — ${lnk.weekly} aulas/semana`;
      const btnDel = document.createElement("button");
      btnDel.textContent = "Remover";
      btnDel.style.background = "#b00020";
      btnDel.addEventListener("click", () => {
        sch.linked[c.name].splice(idx, 1);
        saveCurrentSchool(sch);
        renderLinks();
      });
      row.appendChild(btnDel);
      list.appendChild(row);
    });
    card.appendChild(list);
    linksDiv.appendChild(card);
  });

  container.appendChild(linksDiv);
}

// Export/Import turmas+matérias
function exportClassesTxt() {
  const sch = getCurrentSchool();
  // Linha por turma: Turma;Materia|Professor|AulasSemana,...
  const lines = sch.classes.map(c => {
    const arr = (sch.linked[c.name] || []).map(m => `${m.subject}|${m.teacher}|${m.weekly}`).join(",");
    return `${c.name};${arr}`;
  });
  downloadTxt(lines.join("\n"), `turmas_${sch.name}.txt`);
}
function importClassesTxt(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const sch = getCurrentSchool();
    const lines = reader.result.split("\n").map(l => l.trim()).filter(l => l);
    sch.classes = [];
    sch.linked = {};
    lines.forEach(line => {
      const [cls, rest] = line.split(";");
      const name = (cls || "").trim();
      if (!name) return;
      sch.classes.push({ name });
      sch.linked[name] = (rest || "").split(",").map(seg => {
        const [subject, teacher, weekly] = seg.split("|");
        return { subject: (subject || "").trim(), teacher: (teacher || "").trim(), weekly: parseInt(weekly || "0", 10) };
      }).filter(m => m.subject && m.teacher && m.weekly > 0);
    });
    saveCurrentSchool(sch);
    renderClasses();
    renderLinks();
    alert("Turmas e matérias importadas!");
  };
  reader.readAsText(file);
}

// ===== Geração de horários com validação de conflitos =====
function generateSchedule() {
  const sch = getCurrentSchool();
  const days = sch.days;
  const slots = sch.slots;
  const grid = {}; // grid[className][day][slotIndex] = { subject, teacher, conflito, intervalo }

  // inicializa grid
  sch.classes.forEach(c => {
    grid[c.name] = {};
    days.forEach(d => { grid[c.name][d] = new Array(slots.length).fill(null); });
  });

  const agendaProf = {}; // agendaProf[day::slotIndex] = [teacherNames]

  // distribui por turma e vínculo
  sch.classes.forEach(c => {
    const links = sch.linked[c.name] || [];
    links.forEach(link => {
      let remaining = link.weekly;
      outer:
      for (let di = 0; di < days.length; di++) {
        for (let si = 0; si < slots.length; si++) {
          if (remaining <= 0) break outer;
          const slotTxt = slots[si];
          const day = days[di];

          // intervalo
          if (isIntervalo(slotTxt)) {
            grid[c.name][day][si] = { intervalo: true };
            continue;
          }
          // já preenchido?
          if (grid[c.name][day][si]) continue;

          const key = `${day}::${si}`;
          const ocupados = agendaProf[key] || [];
          if (ocupados.includes(link.teacher)) {
            // marca conflito para diagnóstico dessa turma
            grid[c.name][day][si] = { subject: link.subject, teacher: link.teacher, conflito: true };
            continue;
          }

          // evitar mesma matéria consecutiva na turma (restrição suave)
          const prev = grid[c.name][day][si - 1];
          if (prev && prev.subject === link.subject && !prev.intervalo) {
            continue;
          }

          // aloca
          grid[c.name][day][si] = { subject: link.subject, teacher: link.teacher };
          agendaProf[key] = [...ocupados, link.teacher];
          remaining--;
        }
      }
    });
  });

  renderScheduleTables(grid, days, slots, sch.name);
  sch._lastGrid = grid; // mantem referência temporária
}

function renderScheduleTables(grid, days, slots, schoolName) {
  const container = document.getElementById("scheduleContainer");
  container.innerHTML = "";

  Object.keys(grid).forEach(cls => {
    const title = document.createElement("h3");
    title.textContent = `Escola ${schoolName} — Turma ${cls}`;
    container.appendChild(title);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    trh.innerHTML = `<th>Dia / Horário</th>${slots.map(s => `<th>${s}</th>`).join("")}`;
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    days.forEach(day => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<th>${day}</th>`;
      grid[cls][day].forEach(cell => {
        const td = document.createElement("td");
        if (!cell) {
          td.textContent = "";
        } else if (cell.intervalo) {
          td.textContent = "Intervalo";
          td.classList.add("intervalo");
        } else if (cell.conflito) {
          td.innerHTML = `<div><strong>Conflito</strong></div><div>${cell.subject}</div><div>${cell.teacher}</div>`;
          td.classList.add("conflito");
        } else {
          td.innerHTML = `<div>${cell.subject}</div><div>${cell.teacher}</div>`;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  });
}

// ===== Salvar / listar / carregar horários =====
function saveScheduleVersion() {
  const sch = getCurrentSchool();
  if (!sch._lastGrid) return alert("Gere o horário antes de salvar.");
  sch.schedules.push({ savedAt: nowIso(), grid: sch._lastGrid });
  saveCurrentSchool(sch);
  renderSavedSchedules();
  alert("Versão de horário salva.");
}

function renderSavedSchedules() {
  const sch = getCurrentSchool();
  const container = document.getElementById("savedSchedulesList");
  container.innerHTML = "";
  const list = document.createElement("div");
  list.className = "list";

  (sch.schedules || []).forEach((v, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `Versão ${idx + 1} — ${v.savedAt}`;
    const btnLoad = document.createElement("button");
    btnLoad.textContent = "Carregar";
    btnLoad.addEventListener("click", () => {
      renderScheduleTables(v.grid, sch.days, sch.slots, sch.name);
      sch._lastGrid = v.grid;
    });
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Excluir";
    btnDelete.style.background = "#b00020";
    btnDelete.addEventListener("click", () => {
      sch.schedules.splice(idx, 1);
      saveCurrentSchool(sch);
      renderSavedSchedules();
    });
    row.appendChild(btnLoad);
    row.appendChild(btnDelete);
    list.appendChild(row);
  });

  container.appendChild(list);
}

function loadLatestSchedule() {
  const sch = getCurrentSchool();
  if (!sch.schedules || sch.schedules.length === 0) return alert("Não há versões salvas.");
  const last = sch.schedules[sch.schedules.length - 1];
  renderScheduleTables(last.grid, sch.days, sch.slots, sch.name);
  sch._lastGrid = last.grid;
}

// ===== Exportar Excel =====
function exportExcel() {
  const tables = document.querySelectorAll("#scheduleContainer table");
  if (tables.length === 0) return alert("Gere ou carregue um horário antes de exportar.");
  const wb = XLSX.utils.book_new();
  tables.forEach((tbl, idx) => {
    const ws = XLSX.utils.table_to_sheet(tbl);
    XLSX.utils.book_append_sheet(wb, ws, `Turma_${idx + 1}`);
  });
  XLSX.writeFile(wb, "horarios.xlsx");
}

// ===== Helpers =====
function downloadTxt(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
