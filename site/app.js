/* ==========================================================================
   Ember 落地页脚本
   --------------------------------------------------------------------------
   两件事：
     1. 把站点配置（window.EMBER_SITE）填进下载按钮、页脚、系统要求；
     2. 跑首屏那个能点的演示。

   演示的逻辑是照 App 抄的，不是另写一套：
     - 点圆圈记一次 → 火带前进 → 飘一个 +26 → 那一格亮出「+26 XP · +3 余烬」3 秒；
     - 长按已记的行（500ms）→ 撤销，火带退回；
     - 全部记完 → 标题换成「今天到这儿了。」；
     - 完成的习惯「退到灰里」，不划删除线（App 的 D13）。
   数值也是真的：轻松档 +30 基础分，第 1 次乘 1.0、第 2 次 0.9、第 3 次 0.8
   （App 的软上限），所以 30 / 27 / 24。取整后与演示里的 +30 / +27 / +24 一致。
   ========================================================================== */

(function () {
  'use strict';

  var SITE = window.EMBER_SITE || {};
  var reducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ====================== 1. 站点配置 ====================== */

  function initSite() {
    var repo = typeof SITE.repo === 'string' ? SITE.repo : '';
    var hasRepo = repo.indexOf('CHANGE-ME') === -1 && repo.length > 0;

    // ---- 下载按钮 ----
    var dl = document.getElementById('download');
    var dlLabel = document.getElementById('download-label');
    var dlNote = document.getElementById('download-note');

    if (dl && dlLabel && dlNote) {
      if (SITE.apkVersion && hasRepo) {
        // Releases 里固定命名，与 eas.json 的产物名对齐
        dl.href =
          repo + '/releases/download/v' + SITE.apkVersion + '/ember-' + SITE.apkVersion + '.apk';
        dlLabel.textContent = '下载 apk';
        var bits = ['版本 ' + SITE.apkVersion];
        if (SITE.apkSize) bits.push(SITE.apkSize);
        if (SITE.minAndroid) bits.push('Android ' + SITE.minAndroid + ' 及以上');
        dlNote.textContent = bits.join(' · ');
      } else {
        /*
         * 还没有出包时，**不要**留一个点了没反应的按钮，也不要指向 404。
         * 把按钮变成不可用的样子，并说清楚现在处于哪一步。
         */
        dl.removeAttribute('href');
        dl.setAttribute('aria-disabled', 'true');
        dlLabel.textContent = '还没有可下载的版本';
        dlNote.textContent =
          '这个 App 还没出第一个安装包。出包之后这里会变成下载按钮。';
      }
    }

    // ---- 源码链接 ----
    var repoLink = document.getElementById('repo-link');
    var footRepo = document.getElementById('foot-repo');
    var footReleases = document.getElementById('foot-releases');
    if (hasRepo) {
      if (repoLink) repoLink.href = repo;
      if (footRepo) footRepo.href = repo;
      if (footReleases) footReleases.href = repo + '/releases';
    } else {
      // 没配置仓库时不要把链接指向一个假地址
      [repoLink, footRepo, footReleases].forEach(function (el) {
        if (!el) return;
        el.removeAttribute('href');
        el.setAttribute('aria-disabled', 'true');
        el.style.opacity = '0.5';
        el.style.cursor = 'default';
      });
    }

    // ---- 系统要求 ----
    var reqs = document.getElementById('reqs');
    if (reqs) {
      var min = SITE.minAndroid || '8.0';
      reqs.textContent =
        '需要 Android ' +
        min +
        ' 及以上。不要求 Google 服务，不要求任何账号。' +
        '安装包是通用 apk，不分机型。';
    }

    // ---- 页脚版本 ----
    var ver = document.getElementById('foot-version');
    if (ver) {
      ver.textContent = SITE.apkVersion ? 'Ember ' + SITE.apkVersion : 'Ember';
    }
  }

  /* ====================== 2. 演示 ====================== */

  /*
   * 三件事，与 App 的引导默认选中一致（「喝一杯水」排第一）。
   * xp 是**真的算出来的**：基础 30，第 n 次记乘一个软上限系数。
   */
  var HABITS = [
    { id: 'water', title: '喝一杯水', xp: 30, ember: 3 },
    { id: 'walk', title: '走十分钟', xp: 27, ember: 3 },
    { id: 'read', title: '读两页书', xp: 24, ember: 2 },
  ];

  var state = {
    done: {}, // id -> true
    awardTimer: null,
    longPressTimer: null,
    pressing: null,
  };

  var els = {};

  function initDemo() {
    els.list = document.getElementById('habit-list');
    els.lit = document.getElementById('hearth-lit');
    els.head = document.getElementById('hearth-head');
    els.flare = document.getElementById('hearth-flare');
    els.count = document.getElementById('hearth-count');
    els.award = document.getElementById('hearth-award');
    els.headline = document.getElementById('demo-headline');
    els.date = document.getElementById('demo-date');

    if (!els.list) return;

    els.date.textContent = formatToday();
    els.headline.textContent = greeting() + '。';

    render();
  }

  function formatToday() {
    var d = new Date();
    var week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 ' + week[d.getDay()];
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function doneCount() {
    return HABITS.filter(function (h) {
      return state.done[h.id];
    }).length;
  }

  /* ---- 渲染 ---- */

  function render() {
    var total = HABITS.length;
    var done = doneCount();

    // 火带：宽度按比例；火头光斑跟着走
    var pct = total > 0 ? (done / total) * 100 : 0;
    els.lit.style.width = pct + '%';
    els.head.style.left = pct + '%';
    els.head.style.opacity = done > 0 ? '1' : '0';

    els.count.textContent = '今天 ' + done + ' / ' + total + ' 件';

    // 全部记完时换一句收尾：不庆祝、不催促
    els.headline.textContent = done >= total && total > 0 ? '今天到这儿了。' : greeting() + '。';

    // 行
    els.list.innerHTML = '';
    HABITS.forEach(function (habit) {
      var isDone = !!state.done[habit.id];

      var li = document.createElement('li');
      li.className = 'habit' + (isDone ? ' done' : '');
      li.dataset.id = habit.id;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'habit-circle';
      btn.setAttribute(
        'aria-label',
        (isDone ? '撤销：' : '记一次：') + habit.title
      );
      btn.setAttribute('aria-pressed', isDone ? 'true' : 'false');

      var body = document.createElement('div');
      body.className = 'habit-body';

      var title = document.createElement('div');
      title.className = 'habit-title';
      title.textContent = habit.title;

      var streak = document.createElement('div');
      streak.className = 'habit-streak';
      streak.textContent = isDone ? '连着 1 天了' : '还没有记录';

      body.appendChild(title);
      body.appendChild(streak);

      var undo = document.createElement('span');
      undo.className = 'habit-undo';
      undo.textContent = '按住撤销';

      li.appendChild(btn);
      li.appendChild(body);
      li.appendChild(undo);

      // 点圈 = 记 / 撤销
      btn.addEventListener('click', function () {
        if (isDone) {
          undoHabit(habit.id);
        } else {
          recordHabit(habit.id);
        }
      });

      // 长按已记的行 = 撤销（与 App 一致：长按是撤销的手势）
      if (isDone) {
        li.addEventListener('pointerdown', function (e) {
          if (e.target === btn) return; // 点在圈上走点击
          state.pressing = habit.id;
          li.classList.add('pressing');
          state.longPressTimer = window.setTimeout(function () {
            state.longPressTimer = null;
            state.pressing = null;
            undoHabit(habit.id);
          }, 500);
        });

        var clearPress = function () {
          if (state.longPressTimer) {
            window.clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
          }
          state.pressing = null;
          li.classList.remove('pressing');
        };
        li.addEventListener('pointerup', clearPress);
        li.addEventListener('pointerleave', clearPress);
        li.addEventListener('pointercancel', clearPress);
      }

      els.list.appendChild(li);
    });
  }

  /* ---- 记一次 ---- */

  function recordHabit(id) {
    if (state.done[id]) return;

    var habit = HABITS.filter(function (h) {
      return h.id === id;
    })[0];
    if (!habit) return;

    state.done[id] = true;

    // 飘字：落在手指按下的位置（圆圈旁）
    floatAward(id, '+' + habit.xp);

    render();
    flare();

    // 那一格亮出「刚刚发生了什么」，3 秒后退回
    showAward('+' + habit.xp + ' XP · +' + habit.ember + ' 余烬');
  }

  /* ---- 撤销 ---- */

  function undoHabit(id) {
    if (!state.done[id]) return;
    delete state.done[id];
    render();
    showAward('这一次的奖励退回了');
  }

  /* ---- 火头亮一下（全页唯一的编排动效） ---- */

  function flare() {
    if (reducedMotion || !els.flare) return;
    var pct = (doneCount() / HABITS.length) * 100;
    els.flare.style.left = pct + '%';

    els.flare.classList.remove('on');
    // 强制重排，让动画能重播
    void els.flare.offsetWidth;
    els.flare.classList.add('on');
  }

  /* ---- 飘字 ---- */

  function floatAward(id, text) {
    if (reducedMotion) return;

    var li = els.list.querySelector('.habit[data-id="' + id + '"]');
    if (!li) return;

    var span = document.createElement('span');
    span.className = 'float';
    span.textContent = text;
    li.style.position = 'relative';
    li.appendChild(span);

    window.setTimeout(function () {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 800);
  }

  /* ---- 奖励那一格 ---- */

  function showAward(text) {
    if (!els.award) return;
    els.award.textContent = text;
    els.award.classList.add('on');

    if (state.awardTimer) window.clearTimeout(state.awardTimer);
    state.awardTimer = window.setTimeout(function () {
      els.award.classList.remove('on');
      state.awardTimer = null;
    }, 3000);
  }

  /* ====================== 启动 ====================== */

  function boot() {
    initSite();
    initDemo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
