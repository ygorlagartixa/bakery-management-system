'use strict';

// ============================================================
// 1. ESTADO GLOBAL
// ============================================================
let DB = {
  ingredientes: [], // { id, nome, custoEmbalagem, qtdEmbalagem, unidade }
  estoque:      {}, // { [ingId]: quantidade em g ou ml }
  doces:        [], // { id, nome, ingredientes:[{ingId, qtd}], custo }
  pedidos:      [], // { id, nomeCliente, telefone, endereco, doceId, doceNome, custo, km, frete, cobrarFrete, cobrado, entrada, saida, lucro, data, mes }
  config: {
    nomeSistema: 'Doce Gestão',
    logoBase64:  null,
    navOrder:    ['dashboard','ingredientes','doces','estoque','pedidos','financeiro'],
    freteKm:     0.70,
  }
};

const NAV_META = {
  dashboard:    { icon: '📊', label: 'Dashboard'    },
  ingredientes: { icon: '🥛', label: 'Ingredientes'  },
  doces:        { icon: '🍫', label: 'Doces'         },
  estoque:      { icon: '📦', label: 'Estoque'       },
  pedidos:      { icon: '📋', label: 'Pedidos'       },
  financeiro:   { icon: '💰', label: 'Financeiro'    },
};

// ============================================================
// 2. PERSISTÊNCIA
// ============================================================
const KEYS = {
  ingredientes: 'dg_ingredientes',
  estoque:      'dg_estoque',
  doces:        'dg_doces',
  pedidos:      'dg_pedidos',
  config:       'dg_config',
};

function salvarTudo() {
  localStorage.setItem(KEYS.ingredientes, JSON.stringify(DB.ingredientes));
  localStorage.setItem(KEYS.estoque,      JSON.stringify(DB.estoque));
  localStorage.setItem(KEYS.doces,        JSON.stringify(DB.doces));
  localStorage.setItem(KEYS.pedidos,      JSON.stringify(DB.pedidos));
  localStorage.setItem(KEYS.config,       JSON.stringify(DB.config));
}

function carregarTudo() {
  const parse = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  DB.ingredientes = parse(KEYS.ingredientes, []);
  DB.estoque      = parse(KEYS.estoque,      {});
  DB.doces        = parse(KEYS.doces,        []);
  DB.pedidos      = parse(KEYS.pedidos,      []);
  DB.config       = { ...DB.config, ...parse(KEYS.config, {}) };

  // garante que navOrder só tem chaves válidas
  DB.config.navOrder = (DB.config.navOrder || []).filter(k => NAV_META[k]);
  if (DB.config.navOrder.length === 0) {
    DB.config.navOrder = Object.keys(NAV_META);
  }
}

// ============================================================
// 3. UTILITÁRIOS
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function brl(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function custoPorUnidade(ing) {
  if (!ing || !ing.qtdEmbalagem || ing.qtdEmbalagem === 0) return 0;
  return ing.custoEmbalagem / ing.qtdEmbalagem;
}

// ============================================================
// 4. TOAST
// ============================================================
let toastTimer = null;
function toast(msg, tipo = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${tipo} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

// ============================================================
// 5. MODAIS
// ============================================================
function abrirModal(id) {
  document.getElementById(id).classList.add('open');
}
function fecharModal(id) {
  document.getElementById(id).classList.remove('open');
}
function iniciarModais() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) fecharModal(overlay.id);
    });
  });
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal(btn.dataset.modal));
  });
}

// ============================================================
// 6. NAVEGAÇÃO
// ============================================================
function renderNav() {
  const nav = document.querySelector('.sidebar-nav');
  nav.innerHTML = '';
  DB.config.navOrder.forEach(key => {
    const meta = NAV_META[key];
    if (!meta) return;
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.section = key;
    btn.innerHTML = `<span class="nav-icon">${meta.icon}</span> ${meta.label}`;
    btn.addEventListener('click', () => navegarPara(key));
    nav.appendChild(btn);
  });
  marcarNavAtivo();
}

function marcarNavAtivo() {
  const atual = document.querySelector('.section.active');
  if (!atual) return;
  const id = atual.id.replace('section-', '');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === id);
  });
}

const TITULOS = {
  dashboard:      'Dashboard',
  ingredientes:   'Ingredientes',
  doces:          'Doces',
  estoque:        'Estoque',
  pedidos:        'Pedidos',
  financeiro:     'Financeiro',
  configuracoes:  'Configurações',
};

function navegarPara(secao) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const section = document.getElementById(`section-${secao}`);
  if (section) section.classList.add('active');

  const btn = document.querySelector(`.nav-btn[data-section="${secao}"]`) ||
              document.querySelector(`.sidebar-bottom .nav-btn[data-section="${secao}"]`);
  if (btn) btn.classList.add('active');

  document.getElementById('topbar-title').textContent = TITULOS[secao] || secao;

  if (secao === 'dashboard')    renderDashboard();
  if (secao === 'estoque')      renderEstoque();
  if (secao === 'financeiro')   renderFinanceiro();
  if (secao === 'configuracoes') renderConfiguracoes();
}

// ============================================================
// 7. TOGGLE G/ML (reutilizável)
// ============================================================
function iniciarToggle(btnGId, btnMlId, hiddenId) {
  const btnG  = document.getElementById(btnGId);
  const btnMl = document.getElementById(btnMlId);
  const inp   = document.getElementById(hiddenId);
  if (!btnG || !btnMl || !inp) return;

  btnG.addEventListener('click', () => {
    inp.value = 'g';
    btnG.classList.add('active');
    btnMl.classList.remove('active');
  });
  btnMl.addEventListener('click', () => {
    inp.value = 'ml';
    btnMl.classList.add('active');
    btnG.classList.remove('active');
  });
}

function setToggle(btnGId, btnMlId, hiddenId, valor) {
  const btnG  = document.getElementById(btnGId);
  const btnMl = document.getElementById(btnMlId);
  const inp   = document.getElementById(hiddenId);
  if (!btnG || !btnMl || !inp) return;
  inp.value = valor;
  btnG.classList.toggle('active', valor === 'g');
  btnMl.classList.toggle('active', valor === 'ml');
}

// ============================================================
// 8. INGREDIENTES
// ============================================================
let editandoIngredienteId = null;

function renderIngredientes() {
  const tbody = document.getElementById('tbody-ingredientes');
  if (!DB.ingredientes.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Nenhum ingrediente cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = DB.ingredientes.map(ing => {
    const cpu = custoPorUnidade(ing);
    return `
      <tr>
        <td>${ing.nome}</td>
        <td>${brl(ing.custoEmbalagem)} / ${ing.qtdEmbalagem}${ing.unidade}</td>
        <td>${brl(cpu)} por ${ing.unidade}</td>
        <td>
          <button class="btn-icon" onclick="editarIngrediente('${ing.id}')" title="Editar">✏️</button>
          <button class="btn-icon danger" onclick="deletarIngrediente('${ing.id}')" title="Excluir">🗑️</button>
        </td>
      </tr>`;
  }).join('');
}

function editarIngrediente(id) {
  const ing = DB.ingredientes.find(i => i.id === id);
  if (!ing) return;
  editandoIngredienteId = id;
  document.getElementById('ing-nome').value         = ing.nome;
  document.getElementById('ing-custo').value        = ing.custoEmbalagem;
  document.getElementById('ing-qtd-embalagem').value = ing.qtdEmbalagem;
  setToggle('toggle-g', 'toggle-ml', 'ing-unidade', ing.unidade);
  atualizarPreviewIngrediente();
  document.getElementById('modal-ingrediente-titulo').textContent = 'Editar Ingrediente';
  abrirModal('modal-ingrediente');
}

function deletarIngrediente(id) {
  if (DB.doces.some(d => d.ingredientes.some(i => i.ingId === id))) {
    toast('Ingrediente em uso por um doce. Remova o doce primeiro.', 'error');
    return;
  }
  DB.ingredientes = DB.ingredientes.filter(i => i.id !== id);
  delete DB.estoque[id];
  salvarTudo();
  renderIngredientes();
  renderEstoque();
  toast('Ingrediente removido.', 'warn');
}

function atualizarPreviewIngrediente() {
  const custo = parseFloat(document.getElementById('ing-custo').value) || 0;
  const qtd   = parseFloat(document.getElementById('ing-qtd-embalagem').value) || 0;
  const und   = document.getElementById('ing-unidade').value;
  const box   = document.getElementById('ing-preview-box');
  const txt   = document.getElementById('ing-preview-txt');
  if (custo > 0 && qtd > 0) {
    box.style.display = 'block';
    txt.textContent = `${brl(custo / qtd)} por ${und}`;
  } else {
    box.style.display = 'none';
  }
}

function criarIngredienteComDados(nome, custoEmbalagem, qtdEmbalagem, unidade) {
  const ing = { id: uid(), nome, custoEmbalagem, qtdEmbalagem, unidade };
  DB.ingredientes.push(ing);
  DB.estoque[ing.id] = qtdEmbalagem; // já entra com 1 embalagem no estoque
  return ing;
}

function iniciarIngredientes() {
  iniciarToggle('toggle-g', 'toggle-ml', 'ing-unidade');

  ['ing-custo','ing-qtd-embalagem'].forEach(id => {
    document.getElementById(id).addEventListener('input', atualizarPreviewIngrediente);
  });
  document.getElementById('toggle-g').addEventListener('click', atualizarPreviewIngrediente);
  document.getElementById('toggle-ml').addEventListener('click', atualizarPreviewIngrediente);

  document.getElementById('btn-abrir-modal-ingrediente').addEventListener('click', () => {
    editandoIngredienteId = null;
    document.getElementById('ing-nome').value          = '';
    document.getElementById('ing-custo').value         = '';
    document.getElementById('ing-qtd-embalagem').value = '';
    setToggle('toggle-g', 'toggle-ml', 'ing-unidade', 'g');
    document.getElementById('ing-preview-box').style.display = 'none';
    document.getElementById('modal-ingrediente-titulo').textContent = 'Novo Ingrediente';
    abrirModal('modal-ingrediente');
  });

  document.getElementById('btn-salvar-ingrediente').addEventListener('click', () => {
    const nome          = document.getElementById('ing-nome').value.trim();
    const custoEmbalagem = parseFloat(document.getElementById('ing-custo').value);
    const qtdEmbalagem  = parseFloat(document.getElementById('ing-qtd-embalagem').value);
    const unidade       = document.getElementById('ing-unidade').value;

    if (!nome)                          return toast('Informe o nome do ingrediente.', 'error');
    if (isNaN(custoEmbalagem) || custoEmbalagem < 0) return toast('Informe um custo válido.', 'error');
    if (isNaN(qtdEmbalagem)   || qtdEmbalagem <= 0)  return toast('Informe a quantidade da embalagem.', 'error');

    if (editandoIngredienteId) {
      const ing = DB.ingredientes.find(i => i.id === editandoIngredienteId);
      if (ing) { ing.nome = nome; ing.custoEmbalagem = custoEmbalagem; ing.qtdEmbalagem = qtdEmbalagem; ing.unidade = unidade; }
      // recalcula custo dos doces
      recalcularCustosDoces();
      toast('Ingrediente atualizado!');
    } else {
      criarIngredienteComDados(nome, custoEmbalagem, qtdEmbalagem, unidade);
      toast('Ingrediente cadastrado!');
    }

    editandoIngredienteId = null;
    salvarTudo();
    renderIngredientes();
    renderDoces();
    fecharModal('modal-ingrediente');

    // se veio dos doces sem ingredientes, volta pra lá automaticamente
    if (retornarParaDoce) {
      retornarParaDoce = false;
      navegarPara('doces');
      setTimeout(() => {
        editandoDoceId = null;
        document.getElementById('doce-nome').value = '';
        document.getElementById('doce-ingredientes-lista').innerHTML = '';
        document.getElementById('doce-custo-preview').textContent = brl(0);
        document.getElementById('modal-doce-titulo').textContent = 'Novo Doce';
        document.getElementById('quick-ing-form').style.display = 'none';
        document.getElementById('btn-toggle-quick-ing').textContent = '✚ Criar novo ingrediente aqui';
        abrirModal('modal-doce');
        adicionarLinhaIngredienteDoce();
      }, 200);
      toast('Ingrediente criado! Agora cadastre o doce. 🍫');
    }
  });
}

function recalcularCustosDoces() {
  DB.doces.forEach(d => {
    d.custo = d.ingredientes.reduce((acc, i) => {
      const ing = DB.ingredientes.find(x => x.id === i.ingId);
      return acc + (ing ? custoPorUnidade(ing) * i.qtd : 0);
    }, 0);
  });
}

// ============================================================
// 9. DOCES
// ============================================================
let editandoDoceId  = null;
let retornarParaDoce = false; // flag: veio dos doces sem ingredientes

function renderDoces() {
  const tbody = document.getElementById('tbody-doces');
  if (!DB.doces.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Nenhum doce cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = DB.doces.map(doce => {
    const ings = doce.ingredientes.map(i => {
      const ing = DB.ingredientes.find(x => x.id === i.ingId);
      return ing ? `${i.qtd}${ing.unidade} de ${ing.nome}` : '?';
    }).join(', ');
    return `
      <tr>
        <td>${doce.nome}</td>
        <td style="font-size:0.82rem; color:var(--txt-secondary)">${ings}</td>
        <td>${brl(doce.custo)}</td>
        <td>
          <button class="btn-icon" onclick="editarDoce('${doce.id}')" title="Editar">✏️</button>
          <button class="btn-icon danger" onclick="deletarDoce('${doce.id}')" title="Excluir">🗑️</button>
        </td>
      </tr>`;
  }).join('');
}

function recalcularCustoDoceModal() {
  const rows = document.querySelectorAll('.doce-ing-row');
  let total = 0;
  rows.forEach(row => {
    const ingId = row.querySelector('select').value;
    const qtd   = parseFloat(row.querySelector('input[type="number"]').value) || 0;
    const ing   = DB.ingredientes.find(i => i.id === ingId);
    if (ing) total += custoPorUnidade(ing) * qtd;
  });
  document.getElementById('doce-custo-preview').textContent = brl(total);
}

function adicionarLinhaIngredienteDoce(ingIdInicial = null, qtdInicial = '') {
  const lista = document.getElementById('doce-ingredientes-lista');
  const row   = document.createElement('div');
  row.className = 'doce-ing-row';

  const options = DB.ingredientes.map(i =>
    `<option value="${i.id}" ${i.id === ingIdInicial ? 'selected' : ''}>${i.nome} (${i.unidade})</option>`
  ).join('');

  if (!options) {
    toast('Nenhum ingrediente disponível. Crie um primeiro.', 'warn');
    return;
  }

  row.innerHTML = `
    <select>${options}</select>
    <input type="number" placeholder="Quantidade" min="0" step="0.01" value="${qtdInicial}"/>
    <span class="doce-ing-unidade">—</span>
    <button class="btn-icon danger" title="Remover">✕</button>
  `;

  const sel = row.querySelector('select');
  const atualizarUnidade = () => {
    const ing = DB.ingredientes.find(i => i.id === sel.value);
    row.querySelector('.doce-ing-unidade').textContent = ing ? ing.unidade : '—';
    recalcularCustoDoceModal();
  };

  sel.addEventListener('change', atualizarUnidade);
  row.querySelector('input[type="number"]').addEventListener('input', recalcularCustoDoceModal);
  row.querySelector('button').addEventListener('click', () => { row.remove(); recalcularCustoDoceModal(); });

  lista.appendChild(row);
  atualizarUnidade();
}

function editarDoce(id) {
  if (!DB.ingredientes.length) return toast('Nenhum ingrediente cadastrado.', 'error');
  const doce = DB.doces.find(d => d.id === id);
  if (!doce) return;
  editandoDoceId = id;
  document.getElementById('doce-nome').value = doce.nome;
  document.getElementById('doce-ingredientes-lista').innerHTML = '';
  doce.ingredientes.forEach(i => adicionarLinhaIngredienteDoce(i.ingId, i.qtd));
  recalcularCustoDoceModal();
  document.getElementById('modal-doce-titulo').textContent = 'Editar Doce';
  abrirModal('modal-doce');
}

function deletarDoce(id) {
  DB.doces = DB.doces.filter(d => d.id !== id);
  salvarTudo();
  renderDoces();
  toast('Doce removido.', 'warn');
}

function iniciarDoces() {
  document.getElementById('btn-abrir-modal-doce').addEventListener('click', () => {
    if (!DB.ingredientes.length) {
      retornarParaDoce = true;
      navegarPara('ingredientes');
      toast('Cadastre um ingrediente primeiro. Você voltará para os doces automaticamente.', 'warn');
      setTimeout(() => abrirModal('modal-ingrediente'), 300);
      document.getElementById('modal-ingrediente-titulo').textContent = 'Novo Ingrediente';
      editandoIngredienteId = null;
      document.getElementById('ing-nome').value          = '';
      document.getElementById('ing-custo').value         = '';
      document.getElementById('ing-qtd-embalagem').value = '';
      setToggle('toggle-g', 'toggle-ml', 'ing-unidade', 'g');
      document.getElementById('ing-preview-box').style.display = 'none';
      return;
    }
    editandoDoceId = null;
    document.getElementById('doce-nome').value = '';
    document.getElementById('doce-ingredientes-lista').innerHTML = '';
    document.getElementById('doce-custo-preview').textContent = brl(0);
    document.getElementById('modal-doce-titulo').textContent = 'Novo Doce';
    document.getElementById('quick-ing-form').style.display = 'none';
    document.getElementById('btn-toggle-quick-ing').textContent = '✚ Criar novo ingrediente aqui';
    abrirModal('modal-doce');
    adicionarLinhaIngredienteDoce();
  });

  document.getElementById('btn-add-ingrediente-doce').addEventListener('click', () => adicionarLinhaIngredienteDoce());

  document.getElementById('btn-salvar-doce').addEventListener('click', () => {
    const nome = document.getElementById('doce-nome').value.trim();
    if (!nome) return toast('Informe o nome do doce.', 'error');

    const rows = document.querySelectorAll('.doce-ing-row');
    if (!rows.length) return toast('Adicione ao menos um ingrediente.', 'error');

    const ingredientes = [];
    let valido = true;
    rows.forEach(row => {
      const ingId = row.querySelector('select').value;
      const qtd   = parseFloat(row.querySelector('input[type="number"]').value);
      if (!ingId || isNaN(qtd) || qtd <= 0) { valido = false; return; }
      ingredientes.push({ ingId, qtd });
    });
    if (!valido) return toast('Preencha corretamente todos os ingredientes.', 'error');

    const custo = ingredientes.reduce((acc, i) => {
      const ing = DB.ingredientes.find(x => x.id === i.ingId);
      return acc + (ing ? custoPorUnidade(ing) * i.qtd : 0);
    }, 0);

    if (editandoDoceId) {
      const doce = DB.doces.find(d => d.id === editandoDoceId);
      if (doce) { doce.nome = nome; doce.ingredientes = ingredientes; doce.custo = custo; }
      toast('Doce atualizado!');
    } else {
      DB.doces.push({ id: uid(), nome, ingredientes, custo });
      toast('Doce cadastrado!');
    }

    editandoDoceId = null;
    salvarTudo();
    renderDoces();
    fecharModal('modal-doce');
  });

  // Quick create ingrediente dentro do modal de doce
  iniciarToggle('quick-toggle-g', 'quick-toggle-ml', 'quick-ing-unidade');

  document.getElementById('btn-toggle-quick-ing').addEventListener('click', () => {
    const form = document.getElementById('quick-ing-form');
    const btn  = document.getElementById('btn-toggle-quick-ing');
    const aberto = form.style.display !== 'none';
    form.style.display = aberto ? 'none' : 'flex';
    btn.textContent = aberto ? '✚ Criar novo ingrediente aqui' : '^ Fechar';
  });

  document.getElementById('btn-salvar-quick-ing').addEventListener('click', () => {
    const nome          = document.getElementById('quick-ing-nome').value.trim();
    const custoEmbalagem = parseFloat(document.getElementById('quick-ing-custo').value);
    const qtdEmbalagem  = parseFloat(document.getElementById('quick-ing-qtd').value);
    const unidade       = document.getElementById('quick-ing-unidade').value;

    if (!nome)                          return toast('Informe o nome do ingrediente.', 'error');
    if (isNaN(custoEmbalagem) || custoEmbalagem < 0) return toast('Informe o custo.', 'error');
    if (isNaN(qtdEmbalagem)   || qtdEmbalagem <= 0)  return toast('Informe a quantidade.', 'error');

    const ing = criarIngredienteComDados(nome, custoEmbalagem, qtdEmbalagem, unidade);
    salvarTudo();
    renderIngredientes();

    // limpa form
    document.getElementById('quick-ing-nome').value  = '';
    document.getElementById('quick-ing-custo').value = '';
    document.getElementById('quick-ing-qtd').value   = '';
    setToggle('quick-toggle-g', 'quick-toggle-ml', 'quick-ing-unidade', 'g');
    document.getElementById('quick-ing-form').style.display = 'none';

    // adiciona linha já com o ingrediente recém criado
    adicionarLinhaIngredienteDoce(ing.id, '');
    toast(`Ingrediente "${nome}" criado!`);
  });
}

// ============================================================
// 10. ESTOQUE
// ============================================================
let editandoEstoqueIngId = null;

function renderEstoque() {
  const tbody = document.getElementById('tbody-estoque');
  if (!DB.ingredientes.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Nenhum ingrediente cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = DB.ingredientes.map(ing => {
    const qtd = DB.estoque[ing.id] ?? 0;
    let badgeClass, status;
    if (qtd <= 0)   { badgeClass = 'badge-falta'; status = '⚠️ Em falta'; }
    else if (qtd <= ing.qtdEmbalagem * 0.4) { badgeClass = 'badge-baixo'; status = '🔶 Estoque baixo'; }
    else            { badgeClass = 'badge-ok';    status = '✅ OK'; }
    return `
      <tr>
        <td>${ing.nome}</td>
        <td>${qtd}${ing.unidade}</td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td>
          <button class="btn-icon" onclick="abrirEditarEstoque('${ing.id}')" title="Editar">✏️</button>
          <button class="btn-icon danger" onclick="zerarEstoque('${ing.id}')" title="Zerar estoque">🗑️</button>
        </td>
      </tr>`;
  }).join('');
}

function popularSelectEstoque() {
  const sel = document.getElementById('estoque-ingrediente');
  sel.innerHTML = '<option value="">Selecione um ingrediente</option>' +
    DB.ingredientes.map(i => `<option value="${i.id}">${i.nome} (${i.unidade})</option>`).join('');
}

function abrirEditarEstoque(ingId) {
  const ing = DB.ingredientes.find(i => i.id === ingId);
  if (!ing) return;
  editandoEstoqueIngId = ingId;
  const qtdAtual = DB.estoque[ingId] ?? 0;
  document.getElementById('editar-estoque-nome').value   = `${ing.nome}`;
  document.getElementById('editar-estoque-atual').value  = `${qtdAtual}${ing.unidade}`;
  document.getElementById('editar-estoque-nova').value   = '';
  document.getElementById('editar-estoque-hint').textContent = `Informe a quantidade em ${ing.unidade}`;
  abrirModal('modal-editar-estoque');
}

function zerarEstoque(ingId) {
  if (DB.doces.some(d => d.ingredientes.some(i => i.ingId === ingId))) {
    toast('Ingrediente em uso por um doce. Remova o doce antes de excluir.', 'error');
    return;
  }
  DB.ingredientes = DB.ingredientes.filter(i => i.id !== ingId);
  delete DB.estoque[ingId];
  salvarTudo();
  renderEstoque();
  renderIngredientes();
  toast('Ingrediente removido do estoque.', 'warn');
}

function iniciarEstoque() {
  document.getElementById('btn-abrir-modal-estoque').addEventListener('click', () => {
    popularSelectEstoque();
    document.getElementById('estoque-quantidade').value = '';
    document.getElementById('estoque-unidade-hint').textContent = '';
    abrirModal('modal-estoque');
  });

  document.getElementById('estoque-ingrediente').addEventListener('change', () => {
    const ingId = document.getElementById('estoque-ingrediente').value;
    const ing   = DB.ingredientes.find(i => i.id === ingId);
    document.getElementById('estoque-unidade-hint').textContent =
      ing ? `Informe em ${ing.unidade}` : '';
  });

  document.getElementById('btn-salvar-estoque').addEventListener('click', () => {
    const ingId = document.getElementById('estoque-ingrediente').value;
    const qtd   = parseFloat(document.getElementById('estoque-quantidade').value);
    if (!ingId)              return toast('Selecione um ingrediente.', 'error');
    if (isNaN(qtd) || qtd <= 0) return toast('Informe uma quantidade válida.', 'error');
    DB.estoque[ingId] = (DB.estoque[ingId] ?? 0) + qtd;
    salvarTudo();
    renderEstoque();
    fecharModal('modal-estoque');
    toast('Estoque atualizado!');
  });

  document.getElementById('btn-salvar-editar-estoque').addEventListener('click', () => {
    const nova = parseFloat(document.getElementById('editar-estoque-nova').value);
    if (isNaN(nova) || nova < 0) return toast('Informe uma quantidade válida.', 'error');
    DB.estoque[editandoEstoqueIngId] = nova;
    salvarTudo();
    renderEstoque();
    fecharModal('modal-editar-estoque');
    toast('Estoque atualizado!');
  });
}

// ============================================================
// 11. PEDIDOS
// ============================================================
let editandoPedidoId  = null;
let filtroAtivo       = 'todos';
let buscaAtiva        = '';
let ordenacaoAtiva    = 'data-desc';

function calcularDadosPedido(custoDoce, km, cobrado, cobrarFrete) {
  const frete   = km * DB.config.freteKm;
  const entrada = cobrado + (cobrarFrete ? frete : 0);
  const saida   = custoDoce + frete;
  const lucro   = entrada - saida;
  return { frete, entrada, saida, lucro };
}

function filtrarEOrdenarPedidos(lista) {
  let result = [...lista];

  // filtro de status
  if (filtroAtivo === 'producao')  result = result.filter(p => p.status === 'producao');
  if (filtroAtivo === 'finalizado') result = result.filter(p => p.status === 'finalizado');

  // busca por nome ou doce
  if (buscaAtiva) {
    const q = buscaAtiva.toLowerCase();
    result = result.filter(p =>
      p.nomeCliente.toLowerCase().includes(q) ||
      p.doceNome.toLowerCase().includes(q)
    );
  }

  // ordenação
  result.sort((a, b) => {
    if (ordenacaoAtiva === 'data-desc') return b.id.localeCompare(a.id);
    if (ordenacaoAtiva === 'data-asc')  return a.id.localeCompare(b.id);
    if (ordenacaoAtiva === 'nome')      return a.nomeCliente.localeCompare(b.nomeCliente);
    if (ordenacaoAtiva === 'doce')      return a.doceNome.localeCompare(b.doceNome);
    return 0;
  });

  return result;
}

function renderPedidos() {
  const lista = filtrarEOrdenarPedidos(DB.pedidos);
  const producao   = lista.filter(p => p.status === 'producao');
  const finalizado = lista.filter(p => p.status === 'finalizado');

  const grupoProducao   = document.getElementById('grupo-producao');
  const grupoFinalizado = document.getElementById('grupo-finalizado');

  // Mostra/esconde grupos conforme filtro
  grupoProducao.style.display   = filtroAtivo === 'finalizado' ? 'none' : 'flex';
  grupoFinalizado.style.display = filtroAtivo === 'producao'   ? 'none' : 'flex';

  // Renderiza Em Produção
  const tbodyP = document.getElementById('tbody-producao');
  tbodyP.innerHTML = producao.length ? producao.map(p => `
    <tr>
      <td>${p.data}</td>
      <td>
        <div>${p.nomeCliente}</div>
        ${p.telefone ? `<div style="font-size:0.78rem;color:var(--txt-secondary)">${p.telefone}</div>` : ''}
      </td>
      <td>${p.doceNome}</td>
      <td>${brl(p.cobrado)}</td>
      <td>${p.cobrarFrete ? brl(p.frete) : '<span style="color:var(--txt-secondary)">—</span>'}</td>
      <td style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="btn-concluir" onclick="concluirPedido('${p.id}')" title="Marcar como concluído">✔ Concluir</button>
        <button class="btn-icon" onclick="abrirEditarPedido('${p.id}')" title="Editar">✏️</button>
        <button class="btn-icon danger" onclick="deletarPedido('${p.id}')" title="Excluir">🗑️</button>
      </td>
    </tr>`).join('')
  : '<tr><td colspan="6" class="empty-msg">Nenhum pedido em produção.</td></tr>';

  // Renderiza Finalizados
  const tbodyF = document.getElementById('tbody-finalizado');
  tbodyF.innerHTML = finalizado.length ? finalizado.map(p => `
    <tr>
      <td>${p.data}</td>
      <td>
        <div>${p.nomeCliente}</div>
        ${p.telefone ? `<div style="font-size:0.78rem;color:var(--txt-secondary)">${p.telefone}</div>` : ''}
      </td>
      <td>${p.doceNome}</td>
      <td>${brl(p.cobrado)}</td>
      <td>${p.cobrarFrete ? brl(p.frete) : '<span style="color:var(--txt-secondary)">—</span>'}</td>
      <td style="color:${p.lucro >= 0 ? 'var(--green)' : 'var(--red)'}; font-weight:500">${brl(p.lucro)}</td>
      <td>
        <button class="btn-icon" onclick="abrirEditarPedido('${p.id}')" title="Editar">✏️</button>
        <button class="btn-icon danger" onclick="deletarPedido('${p.id}')" title="Excluir">🗑️</button>
      </td>
    </tr>`).join('')
  : '<tr><td colspan="7" class="empty-msg">Nenhum pedido finalizado.</td></tr>';
}

function concluirPedido(id) {
  const p = DB.pedidos.find(x => x.id === id);
  if (!p) return;
  p.status = 'finalizado';
  salvarTudo();
  renderPedidos();
  renderFinanceiro();
  renderDashboard();
  toast('Pedido marcado como concluído! ✅');
}

function abrirEditarPedido(id) {
  const p = DB.pedidos.find(x => x.id === id);
  if (!p) return;
  editandoPedidoId = id;
  document.getElementById('edit-pedido-nome').value    = p.nomeCliente;
  document.getElementById('edit-pedido-tel').value     = p.telefone || '';
  document.getElementById('edit-pedido-end').value     = p.endereco || '';
  document.getElementById('edit-pedido-cobrado').value = p.cobrado;
  document.getElementById('edit-pedido-km').value      = p.km;
  document.getElementById('edit-pedido-cobrar-frete').checked = p.cobrarFrete;
  abrirModal('modal-editar-pedido');
}

function deletarPedido(id) {
  DB.pedidos = DB.pedidos.filter(p => p.id !== id);
  salvarTudo();
  renderPedidos();
  renderFinanceiro();
  renderDashboard();
  toast('Pedido removido.', 'warn');
}

function iniciarFiltrosPedidos() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroAtivo = btn.dataset.filter;
      renderPedidos();
    });
  });

  document.getElementById('pedido-busca').addEventListener('input', e => {
    buscaAtiva = e.target.value.trim();
    renderPedidos();
  });

  document.getElementById('pedido-ordenar').addEventListener('change', e => {
    ordenacaoAtiva = e.target.value;
    renderPedidos();
  });
}

function iniciarPedidos() {
  iniciarFiltrosPedidos();

  const selDoce      = document.getElementById('pedido-doce');
  const inputKm      = document.getElementById('pedido-km');
  const inputCobrado = document.getElementById('pedido-cobrado');
  const chkFrete     = document.getElementById('pedido-cobrar-frete');

  const atualizarPreviewPedido = () => {
    const doce     = DB.doces.find(d => d.id === selDoce.value);
    const km       = parseFloat(inputKm.value) || 0;
    const cobrado  = parseFloat(inputCobrado.value) || 0;
    const cobFrete = chkFrete.checked;
    document.getElementById('pedido-frete-valor').textContent = brl(km * DB.config.freteKm);
    document.getElementById('frete-km-label').textContent =
      DB.config.freteKm.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const custo = doce ? doce.custo : 0;
    const { frete, entrada, lucro } = calcularDadosPedido(custo, km, cobrado, cobFrete);
    const elTotal = document.getElementById('pedido-total-cliente');
    const elLucro = document.getElementById('pedido-lucro-preview');
    elTotal.textContent = brl(cobrado + (cobFrete ? frete : 0));
    elLucro.textContent = brl(lucro);
    elLucro.style.color = lucro >= 0 ? 'var(--green)' : 'var(--red)';
  };

  selDoce.addEventListener('change', () => {
    const doce = DB.doces.find(d => d.id === selDoce.value);
    const infoBox = document.getElementById('pedido-info-doce');
    if (doce) {
      document.getElementById('pedido-ingredientes-desc').textContent =
        doce.ingredientes.map(i => {
          const ing = DB.ingredientes.find(x => x.id === i.ingId);
          return ing ? `${i.qtd}${ing.unidade} de ${ing.nome}` : '?';
        }).join(', ');
      document.getElementById('pedido-custo-doce').textContent = brl(doce.custo);
      infoBox.style.display = 'block';
    } else {
      infoBox.style.display = 'none';
    }
    atualizarPreviewPedido();
  });

  inputKm.addEventListener('input', atualizarPreviewPedido);
  inputCobrado.addEventListener('input', atualizarPreviewPedido);
  chkFrete.addEventListener('change', atualizarPreviewPedido);

  document.getElementById('btn-abrir-modal-pedido').addEventListener('click', () => {
    if (!DB.doces.length) return toast('Cadastre ao menos um doce antes.', 'error');
    selDoce.innerHTML = '<option value="">Selecione o doce</option>' +
      DB.doces.map(d => `<option value="${d.id}">${d.nome} — ${brl(d.custo)}</option>`).join('');
    document.getElementById('pedido-data').value         = new Date().toISOString().split('T')[0];
    document.getElementById('pedido-cliente-nome').value = '';
    document.getElementById('pedido-cliente-tel').value  = '';
    document.getElementById('pedido-cliente-end').value  = '';
    inputKm.value      = '';
    inputCobrado.value = '';
    chkFrete.checked   = false;
    document.getElementById('pedido-info-doce').style.display = 'none';
    document.getElementById('pedido-frete-valor').textContent  = brl(0);
    document.getElementById('pedido-total-cliente').textContent = brl(0);
    document.getElementById('pedido-lucro-preview').textContent = brl(0);
    abrirModal('modal-pedido');
  });

  document.getElementById('btn-salvar-pedido').addEventListener('click', () => {
    const doce        = DB.doces.find(d => d.id === selDoce.value);
    const nomeCliente = document.getElementById('pedido-cliente-nome').value.trim();
    const telefone    = document.getElementById('pedido-cliente-tel').value.trim();
    const endereco    = document.getElementById('pedido-cliente-end').value.trim();
    const dataVal     = document.getElementById('pedido-data').value;
    const km          = parseFloat(inputKm.value) || 0;
    const cobrado     = parseFloat(inputCobrado.value);
    const cobFrete    = chkFrete.checked;

    if (!doce)        return toast('Selecione um doce.', 'error');
    if (!nomeCliente) return toast('Informe o nome do cliente.', 'error');
    if (isNaN(cobrado) || cobrado < 0) return toast('Informe o valor cobrado.', 'error');

    // Avisa se estoque insuficiente, mas não bloqueia
    const semEstoque = doce.ingredientes
      .filter(i => (DB.estoque[i.ingId] ?? 0) < i.qtd)
      .map(i => DB.ingredientes.find(x => x.id === i.ingId)?.nome || '?');
    if (semEstoque.length) toast(`⚠️ Estoque insuficiente: ${semEstoque.join(', ')}. Pedido registrado mesmo assim.`, 'warn');

    // Baixa estoque
    doce.ingredientes.forEach(i => {
      DB.estoque[i.ingId] = (DB.estoque[i.ingId] ?? 0) - i.qtd;
    });

    const dataFormatada = dataVal
      ? new Date(dataVal + 'T12:00:00').toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');
    const mes = dataVal ? dataVal.slice(0, 7) : mesAtual();
    const { frete, entrada, saida, lucro } = calcularDadosPedido(doce.custo, km, cobrado, cobFrete);

    DB.pedidos.push({
      id: uid(),
      status: 'producao',   // começa sempre em produção
      nomeCliente, telefone, endereco,
      doceId: doce.id, doceNome: doce.nome,
      custo: doce.custo, km, frete, cobrarFrete: cobFrete,
      cobrado, entrada, saida, lucro,
      data: dataFormatada, mes,
    });

    salvarTudo();
    renderPedidos();
    renderEstoque();
    renderDashboard();
    fecharModal('modal-pedido');
    if (!semEstoque.length) toast('Pedido registrado! 🔥 Em produção.');
  });

  document.getElementById('btn-salvar-editar-pedido').addEventListener('click', () => {
    const p = DB.pedidos.find(x => x.id === editandoPedidoId);
    if (!p) return;
    p.nomeCliente = document.getElementById('edit-pedido-nome').value.trim()    || p.nomeCliente;
    p.telefone    = document.getElementById('edit-pedido-tel').value.trim();
    p.endereco    = document.getElementById('edit-pedido-end').value.trim();
    p.cobrado     = parseFloat(document.getElementById('edit-pedido-cobrado').value) || p.cobrado;
    p.km          = parseFloat(document.getElementById('edit-pedido-km').value)      || p.km;
    p.cobrarFrete = document.getElementById('edit-pedido-cobrar-frete').checked;
    const { frete, entrada, saida, lucro } = calcularDadosPedido(p.custo, p.km, p.cobrado, p.cobrarFrete);
    p.frete = frete; p.entrada = entrada; p.saida = saida; p.lucro = lucro;
    salvarTudo();
    renderPedidos();
    renderFinanceiro();
    renderDashboard();
    fecharModal('modal-editar-pedido');
    toast('Pedido atualizado!');
  });
}

// ============================================================
// 12. FINANCEIRO
// ============================================================
function renderFinanceiro() {
  const finalizados = DB.pedidos.filter(p => p.status === 'finalizado');
  let entradas = 0, saidas = 0;
  finalizados.forEach(p => { entradas += (p.entrada || 0); saidas += (p.saida || 0); });
  const lucro = entradas - saidas;

  document.getElementById('fin-entradas').textContent = brl(entradas);
  document.getElementById('fin-saidas').textContent   = brl(saidas);
  const el = document.getElementById('fin-lucro');
  el.textContent = brl(lucro);
  el.style.color = lucro >= 0 ? 'var(--green)' : 'var(--red)';

  const tbody = document.getElementById('tbody-historico');
  if (!finalizados.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Nenhum pedido finalizado ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = [...finalizados].reverse().map(p => `
    <tr>
      <td>${p.data}</td>
      <td>${p.nomeCliente}</td>
      <td>${p.doceNome}</td>
      <td style="color:var(--green)">${brl(p.entrada)}</td>
      <td style="color:var(--red)">-${brl(p.saida)}</td>
      <td style="color:${p.lucro >= 0 ? 'var(--green)' : 'var(--red)'}; font-weight:500">${brl(p.lucro)}</td>
    </tr>
  `).join('');
}

// ============================================================
// 13. DASHBOARD
// ============================================================
function renderDashboard() {
  const mes = mesAtual();
  const pedidosMes    = DB.pedidos.filter(p => p.mes === mes && p.status === 'finalizado');
  const emProducaoMes = DB.pedidos.filter(p => p.mes === mes && p.status === 'producao').length;
  const entradas = pedidosMes.reduce((a, p) => a + (p.entrada || 0), 0);
  const saidas   = pedidosMes.reduce((a, p) => a + (p.saida   || 0), 0);
  const lucro    = entradas - saidas;

  document.getElementById('dash-entradas').textContent = brl(entradas);
  document.getElementById('dash-saidas').textContent   = brl(saidas);
  document.getElementById('dash-pedidos').textContent  =
    `${pedidosMes.length} finalizados${emProducaoMes ? ` · ${emProducaoMes} em produção` : ''}`;
  const el = document.getElementById('dash-lucro');
  el.textContent = brl(lucro);
  el.style.color = lucro >= 0 ? 'var(--green)' : 'var(--red)';

  const alertas = document.getElementById('dash-alertas');
  const emFalta = DB.ingredientes.filter(i => (DB.estoque[i.id] ?? 0) <= 0);
  alertas.innerHTML = emFalta.length
    ? emFalta.map(i => `<li class="alerta-falta">⚠️ ${i.nome} — estoque zerado</li>`).join('')
    : '<li>Nenhum ingrediente em falta. ✅</li>';

  const ul = document.getElementById('dash-ultimos-pedidos');
  ul.innerHTML = DB.pedidos.length
    ? [...DB.pedidos].reverse().slice(0, 5).map(p =>
        `<li>${p.data} — ${p.doceNome} para ${p.nomeCliente}
         <span style="float:right; color:${p.lucro >= 0 ? 'var(--green)' : 'var(--red)'}">
           ${brl(p.lucro)}
         </span></li>`
      ).join('')
    : '<li class="empty-msg">Nenhum pedido registrado.</li>';
}

// ============================================================
// 14. CONFIGURAÇÕES
// ============================================================
function aplicarLogo() {
  const emoji  = document.getElementById('logo-preview-emoji');
  const imgPv  = document.getElementById('logo-preview-img');
  const sideIc = document.querySelector('.sidebar-logo .logo-icon');
  const sideIm = document.getElementById('sidebar-logo-img');
  if (DB.config.logoBase64) {
    if (emoji) emoji.style.display = 'none';
    if (imgPv) { imgPv.src = DB.config.logoBase64; imgPv.style.display = 'block'; }
    if (sideIc) sideIc.style.display = 'none';
    if (sideIm) { sideIm.src = DB.config.logoBase64; sideIm.style.display = 'block'; }
  } else {
    if (emoji) emoji.style.display = 'block';
    if (imgPv) imgPv.style.display = 'none';
    if (sideIc) sideIc.style.display = 'block';
    if (sideIm) sideIm.style.display = 'none';
  }
}

function aplicarNome() {
  const nome = DB.config.nomeSistema || 'Doce Gestão';
  const el = document.querySelector('.logo-text');
  if (el) el.textContent = nome;
  document.title = nome;
}

let dragSrc = null;
function renderSortableNav() {
  const ul = document.getElementById('sortable-nav');
  ul.innerHTML = DB.config.navOrder.map(key => {
    const meta = NAV_META[key];
    if (!meta) return '';
    return `
      <li class="sortable-item" draggable="true" data-key="${key}">
        <span class="drag-handle">⠿</span>
        <span class="sortable-item-icon">${meta.icon}</span>
        ${meta.label}
      </li>`;
  }).join('');

  ul.querySelectorAll('.sortable-item').forEach(item => {
    item.addEventListener('dragstart', e => { dragSrc = item; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragend',   () => { item.classList.remove('dragging'); ul.querySelectorAll('.sortable-item').forEach(i => i.classList.remove('drag-over')); });
    item.addEventListener('dragover',  e => { e.preventDefault(); ul.querySelectorAll('.sortable-item').forEach(i => i.classList.remove('drag-over')); if (item !== dragSrc) item.classList.add('drag-over'); });
    item.addEventListener('drop',      e => { e.preventDefault(); if (dragSrc && dragSrc !== item) { const items = [...ul.querySelectorAll('.sortable-item')]; if (items.indexOf(dragSrc) < items.indexOf(item)) ul.insertBefore(dragSrc, item.nextSibling); else ul.insertBefore(dragSrc, item); } });
  });
}

function renderConfiguracoes() {
  document.getElementById('config-nome-sistema').value = DB.config.nomeSistema;
  document.getElementById('config-frete-km').value     = DB.config.freteKm;
  aplicarLogo();
  renderSortableNav();
}

function iniciarConfiguracoes() {
  document.getElementById('btn-salvar-nome').addEventListener('click', () => {
    const nome = document.getElementById('config-nome-sistema').value.trim();
    if (!nome) return toast('Informe um nome.', 'error');
    DB.config.nomeSistema = nome;
    salvarTudo(); aplicarNome(); toast('Nome atualizado!');
  });

  document.getElementById('config-logo-upload').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Imagem muito grande. Máximo 2MB.', 'error');
    const reader = new FileReader();
    reader.onload = ev => { DB.config.logoBase64 = ev.target.result; salvarTudo(); aplicarLogo(); toast('Logo atualizada!'); };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-remover-logo').addEventListener('click', () => {
    DB.config.logoBase64 = null;
    document.getElementById('config-logo-upload').value = '';
    salvarTudo(); aplicarLogo(); toast('Logo removida.', 'warn');
  });

  document.getElementById('btn-salvar-ordem').addEventListener('click', () => {
    DB.config.navOrder = [...document.querySelectorAll('#sortable-nav .sortable-item')].map(i => i.dataset.key);
    salvarTudo(); renderNav(); toast('Ordem salva!');
  });

  document.getElementById('btn-resetar-ordem').addEventListener('click', () => {
    DB.config.navOrder = Object.keys(NAV_META);
    salvarTudo(); renderNav(); renderSortableNav(); toast('Ordem restaurada.', 'warn');
  });

  document.getElementById('btn-salvar-frete').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('config-frete-km').value);
    if (isNaN(val) || val < 0) return toast('Valor inválido.', 'error');
    DB.config.freteKm = val;
    salvarTudo(); toast('Frete atualizado!');
  });
}

// ============================================================
// 15. INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  carregarTudo();
  document.getElementById('topbar-date').textContent = dataHoje();
  aplicarNome();
  aplicarLogo();
  renderNav();
  iniciarModais();

  // botão configurações (fora do nav dinâmico)
  document.querySelector('.sidebar-bottom .nav-btn').addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    navegarPara('configuracoes');
    document.querySelector('.sidebar-bottom .nav-btn').classList.add('active');
  });

  iniciarIngredientes();
  iniciarDoces();
  iniciarEstoque();
  iniciarPedidos();
  iniciarConfiguracoes();

  renderIngredientes();
  renderDoces();
  renderPedidos();
  renderDashboard();

  navegarPara('dashboard');
});