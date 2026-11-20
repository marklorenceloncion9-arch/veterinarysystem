import vhcPrintCss from '../../../css/vhc-print.css?inline';

/**
 * Print the VHC certificate in a clean iframe document.
 * Avoids printing the admin page URL and fixes blank-page timing issues.
 */
// Diri i-print ang VHC sa limpyo nga panid.
export function printVhcCertificate() {
    const sheet = document.querySelector('.vhc-print-sheet');
    if (!sheet) {
        window.print();
        return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;

    if (!doc || !win) {
        iframe.remove();
        window.print();
        return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Veterinary Health Certificate</title>
    <style>${vhcPrintCss}</style>
</head>
<body><div class="vhc-print-sheet">${sheet.innerHTML}</div></body>
</html>`);
    doc.close();

    // Diri tangtangon ang print iframe human mag-print.
    const cleanup = () => {
        window.setTimeout(() => iframe.remove(), 500);
    };

    win.onafterprint = cleanup;

    window.setTimeout(() => {
        win.focus();
        win.print();
    }, 150);
}
