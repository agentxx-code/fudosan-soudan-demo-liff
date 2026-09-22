(function registerValuationPdf(global) {
    'use strict';

    const A4 = [595.28, 841.89];
    const MARGIN = 48;
    const CONTENT_WIDTH = A4[0] - (MARGIN * 2);

    function toBase64(bytes) {
        let binary = '';

        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(
                ...bytes.subarray(offset, offset + 0x8000),
            );
        }

        return btoa(binary);
    }

    function wrapText(text, document, size, maximumWidth) {
        document.setFontSize(size);
        const lines = [];
        let current = '';

        String(text).split(/\r?\n/).forEach((paragraph, paragraphIndex) => {
            if (paragraphIndex > 0) {
                lines.push('');
            }

            Array.from(paragraph).forEach((character) => {
                const candidate = `${current}${character}`;

                if (current && document.getTextWidth(candidate) > maximumWidth) {
                    lines.push(current);
                    current = character;
                } else {
                    current = candidate;
                }
            });

            if (current) {
                lines.push(current);
                current = '';
            }
        });

        return lines.length ? lines : [''];
    }

    function formatIssueDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    async function generate(report, fontBytes, issuedAt = new Date()) {
        if (!global.jspdf || typeof global.jspdf.jsPDF !== 'function') {
            throw new Error('PDF_LIBRARY_UNAVAILABLE');
        }

        if (!(fontBytes instanceof Uint8Array) || fontBytes.byteLength < 1000) {
            throw new Error('PDF_FONT_UNAVAILABLE');
        }

        const { jsPDF } = global.jspdf;
        const document = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'a4',
            compress: true,
            putOnlyUsedFonts: true,
        });
        document.addFileToVFS(
            'NotoSansJP-Regular.ttf',
            toBase64(fontBytes),
        );
        document.addFont(
            'NotoSansJP-Regular.ttf',
            'NotoSansJP',
            'normal',
        );
        document.setFont('NotoSansJP', 'normal');
        let cursorY = MARGIN;

        function addPage() {
            document.addPage('a4', 'portrait');
            document.setFont('NotoSansJP', 'normal');
            cursorY = MARGIN;
        }

        function ensureSpace(requiredHeight) {
            if (cursorY + requiredHeight > A4[1] - MARGIN - 22) {
                addPage();
            }
        }

        function setColor(color) {
            document.setTextColor(color[0], color[1], color[2]);
        }

        function drawLines(lines, options = {}) {
            const size = options.size || 11;
            const lineHeight = options.lineHeight || size * 1.7;
            const color = options.color || [31, 31, 31];
            document.setFontSize(size);
            setColor(color);

            lines.forEach((line) => {
                ensureSpace(lineHeight);
                document.text(line, options.x || MARGIN, cursorY + size);
                cursorY += lineHeight;
            });
        }

        function paragraph(text, options = {}) {
            const size = options.size || 11;
            const lines = wrapText(
                text,
                document,
                size,
                options.width || CONTENT_WIDTH,
            );
            drawLines(lines, { ...options, size });
            cursorY += options.after === undefined ? 8 : options.after;
        }

        function heading(text) {
            ensureSpace(68);
            cursorY += 8;
            paragraph(text, {
                size: 16,
                lineHeight: 24,
                after: 12,
                color: [13, 13, 13],
            });
            document.setDrawColor(199, 199, 199);
            document.setLineWidth(0.8);
            document.line(MARGIN, cursorY, A4[0] - MARGIN, cursorY);
            cursorY += 16;
        }

        function overviewRow(label, value) {
            const lines = wrapText(
                value,
                document,
                11,
                CONTENT_WIDTH - 130,
            );
            const rowHeight = Math.max(28, lines.length * 18 + 8);
            ensureSpace(rowHeight);
            document.setFontSize(11);
            setColor([51, 51, 51]);
            document.text(label, MARGIN, cursorY + 11);
            setColor([20, 20, 20]);
            lines.forEach((line, index) => {
                document.text(line, MARGIN + 130, cursorY + 11 + (index * 18));
            });
            cursorY += rowHeight;
        }

        paragraph('簡易査定参考レポート', {
            size: 24,
            lineHeight: 34,
            after: 14,
            color: [5, 5, 5],
        });
        paragraph(
            report.disclaimer
                || '参考情報であり、正式な査定結果ではありません',
            {
                size: 12,
                lineHeight: 20,
                after: 18,
                color: [166, 64, 5],
            },
        );

        heading('物件概要');
        overviewRow('物件種別', report.propertyType);
        overviewRow('エリア', report.locationArea);
        overviewRow('面積', `${Number(report.propertyArea).toLocaleString('ja-JP')}㎡`);
        overviewRow('築年数', report.propertyType === '土地' ? '対象外' : `${report.buildingAge}年`);
        overviewRow('物件の現況', report.propertyCondition);

        heading('価格について');
        paragraph('今回は価格を算出していません。', {
            size: 14,
            lineHeight: 22,
            after: 10,
        });
        paragraph(report.supplementalText);

        heading('補足説明');
        paragraph('物件の個別条件、周辺環境、権利関係、接道状況、建物状態などは、この参考レポートだけでは確認できません。入力された5項目の整理と、正式査定へ進む際の確認事項をご案内するものです。');

        heading('今後の相談案内');
        paragraph(report.consultationText);

        paragraph(`発行日：${issuedAt.toLocaleDateString('ja-JP')}`, {
            size: 9,
            lineHeight: 15,
            after: 0,
            color: [89, 89, 89],
        });

        const pageCount = document.getNumberOfPages();
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            document.setPage(pageNumber);
            document.setFont('NotoSansJP', 'normal');
            document.setFontSize(8);
            setColor([115, 115, 115]);
            document.text(`${pageNumber} / ${pageCount}`, A4[0] - MARGIN - 36, A4[1] - 24);
        }

        return {
            bytes: new Uint8Array(document.output('arraybuffer')),
            pageCount,
            fileName: `簡易査定参考レポート_${formatIssueDate(issuedAt)}.pdf`,
        };
    }

    global.ValuationPdf = Object.freeze({ generate, wrapText });
}(typeof window === 'undefined' ? globalThis : window));
