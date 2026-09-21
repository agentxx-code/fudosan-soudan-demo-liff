(() => {
    'use strict';

    const LIFF_ID = '2011674482-yvZEalkR';
    const REPORT_API_URL = 'https://sitema0.wixstudio.com/my-site-1/_functions/liffValuationReportData?rc=test-site';
    const REPORT_REF_PATTERN = /^[a-f0-9]{32}$/;
    const statusElement = document.getElementById('status');
    const reportElement = document.getElementById('report');

    function showStatus(message) {
        statusElement.replaceChildren();
        const heading = document.createElement('h1');
        const paragraph = document.createElement('p');
        heading.textContent = '簡易査定レポート';
        paragraph.textContent = message;
        statusElement.append(heading, paragraph);
        statusElement.classList.remove('hidden');
        reportElement.classList.add('hidden');
    }

    function showError(title, message) {
        statusElement.replaceChildren();
        const heading = document.createElement('h1');
        const paragraph = document.createElement('p');
        heading.textContent = title;
        paragraph.textContent = message;
        statusElement.append(heading, paragraph);
        statusElement.classList.remove('hidden');
        reportElement.classList.add('hidden');
    }

    function appendOverview(label, value) {
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = label;
        description.textContent = String(value);
        document.getElementById('overview').append(term, description);
    }

    function renderReport(report) {
        document.getElementById('overview').replaceChildren();
        appendOverview('物件種別', report.propertyType);
        appendOverview('エリア', report.locationArea);
        appendOverview('面積', `${Number(report.propertyArea).toLocaleString('ja-JP')}㎡`);
        appendOverview('築年数', report.propertyType === '土地' ? '対象外' : `${report.buildingAge}年`);
        appendOverview('物件の現況', report.propertyCondition);
        document.getElementById('supplemental').textContent = report.supplementalText;
        document.getElementById('consultation').textContent = report.consultationText;
        document.getElementById('expiry').textContent = `閲覧期限：${new Date(report.accessExpiresAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（日本時間）`;
        statusElement.classList.add('hidden');
        reportElement.classList.remove('hidden');
    }

    async function start() {
        const initialUrl = new URL(window.location.href);
        const wasPrimaryRedirect = initialUrl.searchParams.has('liff.state');
        let idToken = null;

        showStatus('レポートを確認しています…');

        try {
            await window.liff.init({ liffId: LIFF_ID });
        } catch (error) {
            showError(
                '本人確認を開始できません',
                'LINEの初期化に失敗しました。通信状態をご確認のうえ、もう一度お試しください。',
            );
            return;
        }

        const initializedUrl = new URL(window.location.href);
        if (wasPrimaryRedirect && initializedUrl.searchParams.has('liff.state')) {
            showStatus('レポート画面へ移動しています…');
            return;
        }

        const reportRef = initializedUrl.searchParams.get('reportRef') || '';
        if (!REPORT_REF_PATTERN.test(reportRef)) {
            showError(
                'レポートを表示できません',
                '閲覧リンクが正しくないか、無効になっています。',
            );
            return;
        }

        if (!window.liff.isLoggedIn()) {
            window.liff.login({ redirectUri: window.location.href });
            return;
        }

        try {
            idToken = window.liff.getIDToken();
            if (typeof idToken !== 'string' || idToken.length === 0) {
                throw new Error('ID_TOKEN_UNAVAILABLE');
            }

            const result = await fetch(REPORT_API_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reportRef }),
                credentials: 'omit',
                cache: 'no-store',
            });
            const payload = await result.json().catch(() => null);

            if (result.status === 410) {
                showError(
                    '閲覧期限が切れています',
                    'このレポートの閲覧期限は終了しました。必要な場合は、管理者へ再発行をご依頼ください。',
                );
                return;
            }

            if (!result.ok || !payload || payload.ok !== true || !payload.report) {
                if (result.status === 403
                    && initializedUrl.searchParams.get('authRetry') !== '1'
                    && window.liff.isLoggedIn()) {
                    const retryUrl = new URL(window.location.href);
                    retryUrl.searchParams.set('authRetry', '1');
                    window.liff.logout();
                    window.location.replace(retryUrl.toString());
                    return;
                }

                initializedUrl.searchParams.delete('authRetry');
                window.history.replaceState(null, '', initializedUrl.toString());
                showError(
                    'レポートを表示できません',
                    '本人確認またはレポートの照合に失敗しました。LINEで受け取ったリンクをもう一度ご確認ください。',
                );
                return;
            }

            initializedUrl.searchParams.delete('authRetry');
            window.history.replaceState(null, '', initializedUrl.toString());
            renderReport(payload.report);
        } catch (error) {
            showError(
                'レポートを表示できません',
                '本人確認またはレポートの取得に失敗しました。時間をおいてもう一度お試しください。',
            );
        } finally {
            idToken = null;
        }
    }

    start();
})();
