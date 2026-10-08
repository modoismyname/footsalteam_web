/*
 * 출력물 만들기: A4 편성표(캔버스 → PDF), 공유용 팀 명단 PNG.
 * 외부 라이브러리와 폰트 파일 없이, 브라우저가 가진 한글 글꼴로 캔버스에 그린다.
 * PDF는 페이지마다 캔버스를 JPEG로 바꿔 넣는 방식이라 오프라인에서도 한글이 깨지지 않는다.
 */
(function (root) {
  'use strict';

  var C = root.Core;
  var FONT = '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", "Nanum Gothic", sans-serif';
  var TEAM_COLORS = ['#2563eb', '#dc2626', '#d97706'];
  var BENCH_COLOR = '#6b7280';
  var BRAND = '#1f7a4d';

  // A4 = 210 × 297mm. 150dpi 기준 1240 × 1754px, PDF 단위로는 595.28 × 841.89pt.
  var A4_W = 1240;
  var A4_H = 1754;
  var PX = A4_W / 595.28; // 1pt 당 픽셀

  function font(weight, sizePt) {
    return weight + ' ' + Math.round(sizePt * PX) + 'px ' + FONT;
  }

  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ---------------- A4 편성표 ----------------

  /** 확정 편성표를 A4 페이지 캔버스 배열로 그린다. */
  function renderLineupPages(lineup) {
    var margin = 40 * PX;
    var contentW = A4_W - margin * 2;
    var rowH = 20 * PX;
    var teamHeadH = 24 * PX;
    var gap = 14 * PX;
    var cols = [2.2, 1, 1, 1, 1, 1, 1]; // 이름, 5개 항목, 합계
    var colSum = cols.reduce(function (a, b) { return a + b; }, 0);
    var colW = cols.map(function (c) { return contentW * c / colSum; });

    var pages = [];
    var ctx, y;

    function newPage(first) {
      var c = newCanvas(A4_W, A4_H);
      ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, A4_W, A4_H);
      ctx.textBaseline = 'middle';
      pages.push(c);
      y = margin;
      if (first) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.font = font('700', 20);
        ctx.fillText('풋살 팀 편성표', A4_W / 2, y + 12 * PX);
        ctx.font = font('400', 11);
        ctx.fillStyle = '#555555';
        ctx.fillText('경기일 ' + C.formatKoreanDate(lineup.date) + ' · ' +
          C.MODES[lineup.mode] + ' 편성', A4_W / 2, y + 36 * PX);
        y += 58 * PX;
      }
    }

    function ensure(h) {
      if (y + h > A4_H - margin) newPage(false);
    }

    function cell(text, x, w, align, bold) {
      ctx.font = font(bold ? '700' : '400', 10);
      ctx.fillStyle = '#111111';
      ctx.textAlign = align;
      var tx = align === 'left' ? x + 6 * PX : x + w / 2;
      ctx.fillText(fit(text, w - 10 * PX), tx, y + rowH / 2);
    }

    function fit(text, maxW) {
      text = String(text);
      if (ctx.measureText(text).width <= maxW) return text;
      while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
      return text + '…';
    }

    function row(values, fill, bold) {
      var x = margin;
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(margin, y, contentW, rowH);
      }
      ctx.strokeStyle = '#777777';
      ctx.lineWidth = Math.max(1, 0.5 * PX);
      values.forEach(function (v, i) {
        ctx.strokeRect(x, y, colW[i], rowH);
        cell(v, x, colW[i], i === 0 ? 'left' : 'center', bold);
        x += colW[i];
      });
      y += rowH;
    }

    newPage(true);
    var header = ['이름'].concat(C.STATS.map(function (s) { return s.label; }), ['합계']);
    lineup.teams.forEach(function (team, i) {
      var tableH = teamHeadH + rowH * (team.players.length + 2) + gap;
      ensure(tableH);
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(margin, y, contentW, teamHeadH);
      ctx.fillStyle = TEAM_COLORS[i];
      ctx.fillRect(margin, y, 5 * PX, teamHeadH);
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      ctx.font = font('700', 12);
      ctx.fillText(C.teamName(i) + ' (' + team.players.length + '명)', margin + 12 * PX, y + teamHeadH / 2);
      y += teamHeadH;
      row(header, '#eeeeee', true);
      team.players.forEach(function (p) {
        row([p.name].concat(C.STATS.map(function (s) { return p.stats[s.key]; }), [C.total(p)]));
      });
      row(['팀 합계'].concat(C.STATS.map(function (s) { return C.teamSum(team, s.key); }),
        [C.teamTotal(team)]), '#f5f5f5', true);
      y += gap;
    });

    if (lineup.bench.length) {
      var names = lineup.bench.map(function (p) { return p.name; });
      ctx.font = font('400', 11);
      var lines = wrap('교체대기: ' + names.join(', '), contentW);
      ensure(lines.length * 16 * PX);
      lines.forEach(function (line, n) {
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'left';
        if (n === 0) {
          ctx.font = font('700', 11);
          ctx.fillText('교체대기:', margin, y + 8 * PX);
          var w = ctx.measureText('교체대기: ').width;
          ctx.font = font('400', 11);
          ctx.fillText(line.slice('교체대기: '.length), margin + w, y + 8 * PX);
        } else {
          ctx.fillText(line, margin, y + 8 * PX);
        }
        y += 16 * PX;
      });
    }

    function wrap(text, maxW) {
      var words = text.split(' ');
      var lines = [];
      var cur = '';
      words.forEach(function (w) {
        var next = cur ? cur + ' ' + w : w;
        if (cur && ctx.measureText(next).width > maxW) {
          lines.push(cur);
          cur = w;
        } else {
          cur = next;
        }
      });
      if (cur) lines.push(cur);
      return lines;
    }

    // 쪽 번호
    if (pages.length > 1) {
      pages.forEach(function (c, i) {
        var x = c.getContext('2d');
        x.font = font('400', 9);
        x.fillStyle = '#777777';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText((i + 1) + ' / ' + pages.length, A4_W / 2, A4_H - margin / 2);
      });
    }
    return pages;
  }

  // ---------------- 최소 PDF 작성기 ----------------

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function asciiBytes(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  /** PDF 문자열에 한글을 넣기 위한 UTF-16BE 16진 문자열. */
  function pdfTextHex(s) {
    var hex = 'FEFF';
    for (var i = 0; i < s.length; i++) {
      hex += ('0000' + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4);
    }
    return '<' + hex + '>';
  }

  /** 페이지 캔버스들을 A4 PDF(Blob)로 묶는다. */
  function canvasesToPdf(canvases, title) {
    var parts = [];
    var offsets = [];
    var length = 0;

    function push(bytes) {
      parts.push(bytes);
      length += bytes.length;
    }
    function str(s) { push(asciiBytes(s)); }
    function beginObj(n) {
      offsets[n] = length;
      str(n + ' 0 obj\n');
    }

    var n = canvases.length;
    // 객체 번호: 1 카탈로그, 2 페이지 목록, 3 문서 정보, 이후 페이지마다 [페이지, 내용, 이미지]
    var pageIds = canvases.map(function (_, i) { return 4 + i * 3; });

    str('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    beginObj(1);
    str('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    beginObj(2);
    str('<< /Type /Pages /Count ' + n + ' /Kids [' +
      pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] >>\nendobj\n');
    beginObj(3);
    str('<< /Title ' + pdfTextHex(title) + ' /Producer (Futsal Team Balancer) >>\nendobj\n');

    canvases.forEach(function (canvas, i) {
      var pageId = pageIds[i];
      var contentId = pageId + 1;
      var imageId = pageId + 2;
      var jpeg = base64ToBytes(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
      var content = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q\n';

      beginObj(pageId);
      str('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] ' +
        '/Resources << /XObject << /Im0 ' + imageId + ' 0 R >> >> /Contents ' +
        contentId + ' 0 R >>\nendobj\n');
      beginObj(contentId);
      str('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');
      beginObj(imageId);
      str('<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length +
        ' >>\nstream\n');
      push(jpeg);
      str('\nendstream\nendobj\n');
    });

    var count = 4 + n * 3;
    var xref = length;
    var table = 'xref\n0 ' + count + '\n0000000000 65535 f \n';
    for (var id = 1; id < count; id++) {
      table += ('0000000000' + offsets[id]).slice(-10) + ' 00000 n \n';
    }
    str(table);
    str('trailer\n<< /Size ' + count + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function lineupPdf(lineup) {
    return canvasesToPdf(renderLineupPages(lineup), '풋살 팀 편성표 ' + lineup.date);
  }

  // ---------------- 공유 이미지 ----------------

  function roundRect(ctx, x, y, w, h, r, topOnly) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    if (topOnly) {
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
    } else {
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    }
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** 팀별 이름만 담은 공유 이미지 캔버스. 능력치와 점수는 넣지 않는다. */
  function renderShareImage(lineup) {
    var groups = lineup.teams.map(function (t, i) {
      return { title: C.teamName(i), color: TEAM_COLORS[i], names: t.players.map(function (p) { return p.name; }) };
    });
    if (lineup.bench.length) {
      groups.push({ title: '교체대기', color: BENCH_COLOR, names: lineup.bench.map(function (p) { return p.name; }) });
    }
    var width = 720, pad = 32, gap = 20, headerH = 96, rowH = 40, titleH = 52;
    var cols = Math.min(groups.length, 2);
    var rows = Math.ceil(groups.length / cols);
    var maxNames = Math.max.apply(null, groups.map(function (g) { return g.names.length; }));
    var cardW = (width - pad * 2 - gap * (cols - 1)) / cols;
    var cardH = titleH + 20 + maxNames * rowH;
    var height = headerH + 24 + rows * (cardH + gap) + 12;
    var scale = 2;

    var c = newCanvas(width * scale, Math.round(height * scale));
    var x = c.getContext('2d');
    x.scale(scale, scale);
    x.textBaseline = 'middle';
    x.fillStyle = '#f4f6f4';
    x.fillRect(0, 0, width, height);
    x.fillStyle = BRAND;
    x.fillRect(0, 0, width, headerH);
    x.fillStyle = '#ffffff';
    x.font = '700 28px ' + FONT;
    x.fillText('풋살 팀 편성', pad, 38);
    x.font = '400 17px ' + FONT;
    x.fillText(C.formatKoreanDate(lineup.date), pad, 74);

    groups.forEach(function (g, i) {
      var gx = pad + (i % cols) * (cardW + gap);
      var gy = headerH + 24 + Math.floor(i / cols) * (cardH + gap);
      x.fillStyle = '#ffffff';
      roundRect(x, gx, gy, cardW, cardH, 14);
      x.fill();
      x.fillStyle = g.color;
      roundRect(x, gx, gy, cardW, titleH, 14, true);
      x.fill();
      x.fillStyle = '#ffffff';
      x.textAlign = 'left';
      x.font = '700 22px ' + FONT;
      x.fillText(g.title, gx + 18, gy + titleH / 2);
      x.textAlign = 'right';
      x.font = '400 16px ' + FONT;
      x.fillText(g.names.length + '명', gx + cardW - 18, gy + titleH / 2);
      x.textAlign = 'left';
      x.fillStyle = '#1b1f1c';
      x.font = '400 19px ' + FONT;
      g.names.forEach(function (n, j) {
        x.fillText((j + 1) + '. ' + n, gx + 22, gy + titleH + 10 + rowH * (j + 0.5));
      });
    });
    return c;
  }

  function canvasToBlob(canvas, type) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('이미지를 만들 수 없습니다.'));
      }, type || 'image/png');
    });
  }

  root.Output = {
    renderLineupPages: renderLineupPages,
    canvasesToPdf: canvasesToPdf,
    lineupPdf: lineupPdf,
    renderShareImage: renderShareImage,
    canvasToBlob: canvasToBlob,
    TEAM_COLORS: TEAM_COLORS,
  };
})(window);
