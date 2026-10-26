// 临时:找出手机宽度下横向溢出的元素。跑完即删。
const html = `<script>
window.addEventListener('load', () => {
  setTimeout(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    out.push('vw=' + vw + ' scrollW=' + document.documentElement.scrollWidth);
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 40) : el.tagName;
        out.push(el.tagName + '.' + cls + ' L=' + Math.round(r.left) + ' R=' + Math.round(r.right) + ' W=' + Math.round(r.width));
      }
    });
    document.title = 'DIAG';
    const pre = document.createElement('pre');
    pre.id = 'diag-out';
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
  }, 1500);
});
</script>`;
document.title = html;
