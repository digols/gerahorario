// ... imports e setup supabase iguais à versão anterior ...

const isIntervalo = (s) => s.toLowerCase().includes("intervalo");

// Utilidades de agenda
function isTeacherBusy(agendaProf, day, slotIndex, teacherName) {
  const key = `${day}::${slotIndex}`;
  const ocupados = agendaProf[key] || [];
  return ocupados.includes(teacherName);
}
function occupyTeacher(agendaProf, day, slotIndex, teacherName) {
  const key = `${day}::${slotIndex}`;
  const ocupados = agendaProf[key] || [];
  agendaProf[key] = [...ocupados, teacherName];
}

// Verifica se dois slots são adjacentes válidos para bloco duplo
function isValidDouble(slots, s1, s2) {
  if (s2 !== s1 + 1) return false;
  const txt1 = slots[s1], txt2 = slots[s2];
  if (isIntervalo(txt1) || isIntervalo(txt2)) return false;
  return true;
}

// Evita “trinca” consecutiva da mesma matéria (dupla é desejada, 3 seguidas não)
function wouldMakeTriple(grid, turmaNome, day, slotIndex, subject) {
  const prev1 = grid[turmaNome][day][slotIndex - 1];
  const prev2 = grid[turmaNome][day][slotIndex - 2];
  return prev1 && prev2 && prev1.subject === subject && prev2.subject === subject;
}

// Tenta encontrar um par de slots adjacentes para bloco duplo
function findDoublePair(grid, agendaProf, turmaNome, day, slots, teacherName, subject) {
  for (let si = 0; si < slots.length - 1; si++) {
    if (!isValidDouble(slots, si, si + 1)) continue;
    // slots livres?
    if (grid[turmaNome][day][si] || grid[turmaNome][day][si + 1]) continue;
    // conflitos professor?
    if (isTeacherBusy(agendaProf, day, si, teacherName)) continue;
    if (isTeacherBusy(agendaProf, day, si + 1, teacherName)) continue;
    // evitar trinca (aplicar apenas na segunda posição para não formar 3 seguidas)
    if (wouldMakeTriple(grid, turmaNome, day, si, subject)) continue;
    return [si, si + 1];
  }
  return null;
}

// Tenta encontrar um slot simples válido
function findSingleSlot(grid, agendaProf, turmaNome, day, slots, teacherName, subject) {
  for (let si = 0; si < slots.length; si++) {
    if (isIntervalo(slots[si])) continue;
    if (grid[turmaNome][day][si]) continue;
    if (isTeacherBusy(agendaProf, day, si, teacherName)) continue;
    if (wouldMakeTriple(grid, turmaNome, day, si, subject)) continue;
    // evitar mesma matéria imediatamente após dupla do mesmo dia? Regra suave:
    const prev = grid[turmaNome][day][si - 1];
    const prevPrev = grid[turmaNome][day][si - 2];
    const isDoubleBefore = prev && prevPrev && prev.subject === subject && prevPrev.subject === subject;
    if (isDoubleBefore) continue;
    return si;
  }
  return null;
}

// Heurística simples para ordem de dias: embaralha leve pra balancear
function orderDays(dias) {
  return [...dias].sort((a, b) => a.localeCompare(b)); // pode trocar por uma aleatorização controlada
}

// Heurística simples para ordem de vínculos: prioriza maiores aulas_semana
function orderLinks(links) {
  return [...links].sort((l1, l2) => (l2.aulas_semana || 0) - (l1.aulas_semana || 0));
}

// Geração com preferência por blocos duplos
generateBtn.addEventListener("click", async () => {
  const { data: turmas } = await supabase.from("turmas").select("*").eq("escola_id", escolaId);
  const { data: linksRaw } = await supabase
    .from("turma_materia_professor")
    .select("*, turmas(id,nome), materias(id,nome), professores(id,nome)")
    .in("turma_id", (turmas || []).map(t => t.id));

  const grid = {};
  (turmas || []).forEach(t => {
    grid[t.nome] = {};
    dias.forEach(d => { grid[t.nome][d] = new Array(slots.length).fill(null); });
  });

  const agendaProf = {}; // agenda por dia/slot
  const orderedDays = orderDays(dias);
  const links = orderLinks(linksRaw || []);

  // 1) Alocar blocos duplos primeiro
  for (const lnk of links) {
    let remaining = lnk.aulas_semana || 0;
    const turmaNome = lnk.turmas?.nome;
    const subjectName = lnk.materias?.nome;
    const profName = lnk.professores?.nome;

    // quantos pares cabem
    let pairsToPlace = Math.floor(remaining / 2);

    for (const day of orderedDays) {
      if (pairsToPlace <= 0) break;
      const pair = findDoublePair(grid, agendaProf, turmaNome, day, slots, profName, subjectName);
      if (!pair) continue;

      const [s1, s2] = pair;
      grid[turmaNome][day][s1] = { subject: subjectName, teacher: profName, double: true };
      grid[turmaNome][day][s2] = { subject: subjectName, teacher: profName, double: true };
      occupyTeacher(agendaProf, day, s1, profName);
      occupyTeacher(agendaProf, day, s2, profName);
      pairsToPlace--;
      remaining -= 2;
    }

    // Guarda remanescente para singles na segunda fase
    lnk._remaining = remaining;
  }

  // 2) Alocar singles restantes
  for (const lnk of links) {
    let remaining = lnk._remaining || 0;
    if (remaining <= 0) continue;

    const turmaNome = lnk.turmas?.nome;
    const subjectName = lnk.materias?.nome;
    const profName = lnk.professores?.nome;

    for (const day of orderedDays) {
      if (remaining <= 0) break;
      const si = findSingleSlot(grid, agendaProf, turmaNome, day, slots, profName, subjectName);
      if (si == null) continue;

      grid[turmaNome][day][si] = { subject: subjectName, teacher: profName };
      occupyTeacher(agendaProf, day, si, profName);
      remaining--;
    }

    // Se sobrou e não encontrou slot, marca diagnóstico de conflito ligeiro:
    lnk._remaining = remaining;
  }

  // 3) Preencher Intervalos explicitamente (opcional)
  Object.keys(grid).forEach(turmaNome => {
    orderedDays.forEach(day => {
      for (let si = 0; si < slots.length; si++) {
        if (isIntervalo(slots[si])) {
          grid[turmaNome][day][si] = { intervalo: true };
        }
      }
    });
  });

  renderGrid(grid);

  // Avisos de vínculos não completamente alocados
  const pendentes = links.filter(l => (l._remaining || 0) > 0);
  if (pendentes.length) {
    alert(`Algumas aulas não foram alocadas por falta de slots sem conflito.\nPendentes: ${pendentes.map(p => `${p.turmas?.nome}/${p.materias?.nome} (${p._remaining})`).join(", ")}`);
  }
});
