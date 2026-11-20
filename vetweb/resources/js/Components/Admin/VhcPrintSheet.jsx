import {
    buildVhcPrintRows,
    DEFAULT_VHC_ISSUED_AT,
    formatVhcPrintAmount,
    formatVhcPrintDateParts,
    getVhcControlNumber,
} from '@/Components/Admin/vhcUi';

// Diri ang usa ka linya nga label ug value sa printed VHC.
const PrintLine = ({ label, value, className = '' }) => (
    <div className={`vhc-print-line ${className}`}>
        <span className="vhc-print-line-label">{label}</span>
        <span className="vhc-print-line-value">{value || '\u00A0'}</span>
    </div>
);

// Diri ipakita ang seal image sa printed VHC.
const Seal = ({ src, alt }) => (
    <img src={src} alt={alt} className="vhc-print-seal" />
);

// Diri ang printable nga panid sa VHC certificate.
export default function VhcPrintSheet({ record }) {
    const rows = buildVhcPrintRows(record);
    const issued = formatVhcPrintDateParts(record.issued_on);
    const validTill = formatVhcPrintDateParts(record.valid_till);
    const controlNumber = getVhcControlNumber(record);
    const issuedAt = record.issued_at || DEFAULT_VHC_ISSUED_AT;

    return (
        <div className="vhc-print-sheet">
            <header className="vhc-print-header">
                <div className="vhc-print-header-side">
                    <Seal src="/images/el_salvador_city_logo.png" alt="City of El Salvador seal" />
                    <p className="vhc-print-official-name">HON. EDGAR S. LIGNES</p>
                    <p className="vhc-print-official-title">City Mayor</p>
                </div>

                <div className="vhc-print-header-center">
                    <p>Republic of the Philippines</p>
                    <p>Province of Misamis Oriental</p>
                    <p className="vhc-print-header-emphasis">LOCAL GOVERNMENT UNIT</p>
                    <p className="vhc-print-header-city">CITY OF EL SALVADOR</p>
                    <p className="vhc-print-header-office">CITY VETERINARY OFFICE</p>
                    <p className="vhc-print-header-email">cityvetoffice@gmail.com</p>
                </div>

                <div className="vhc-print-header-side vhc-print-header-side-right">
                    <Seal src="/images/el_salvador_city_vet_logo.png" alt="Office of the City Veterinarian seal" />
                    <p className="vhc-print-official-name">MR. NOLLY ADRIAN B. GABULE</p>
                    <p className="vhc-print-official-title">OIC, City Veterinary Office</p>
                </div>
            </header>

            <div className="vhc-print-control-row">
                <p className="vhc-print-title">VETERINARY HEALTH CERTIFICATE (VHC)</p>
                <p className="vhc-print-control-no">
                    Control No.: <strong>{controlNumber}</strong>
                </p>
            </div>

            <section className="vhc-print-body">
                <p className="vhc-print-salutation">TO WHOM IT MAY CONCERN:</p>
                <p className="vhc-print-intro">
                    THIS IS TO CERTIFY that the following animal(s) described below has been physically examined
                    and found out to be apparently healthy:
                </p>

                <table className="vhc-print-table">
                    <thead>
                        <tr>
                            <th>SPECIES</th>
                            <th>QUANTITY</th>
                            <th>SEX</th>
                            <th>AGE</th>
                            <th>COLOR</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={index}>
                                <td>{row.species}</td>
                                <td>{row.quantity}</td>
                                <td>{row.sex}</td>
                                <td>{row.age}</td>
                                <td>{row.color}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="vhc-print-details">
                    <PrintLine label="Owner/Farm" value={record.name} />
                    <PrintLine label="Contact Number" value={record.contact_number} />
                    <PrintLine label="Address" value={record.origin} />
                    <PrintLine label="Purpose/Use of VHC" value={record.purpose} />
                    <PrintLine label="Animal(s) Origin" value={record.animals_origin} />
                    <PrintLine label="Destination" value={record.destination} />
                </div>

                <p className="vhc-print-legal">
                    This certificate is issued for whatever legal purposes this may serve.
                </p>
                <p className="vhc-print-legal">
                    Issued at the Office of the City Veterinarian of the City Government Unit of El Salvador,
                    Province of Misamis Oriental, Philippines.
                </p>
                <p className="vhc-print-validity">
                    This Veterinary Health Certificate is issued on{' '}
                    <strong>{issued.label}</strong> {issued.year} is valid until{' '}
                    <strong>{validTill.label}</strong> {validTill.year}.
                </p>
            </section>

            <footer className="vhc-print-footer">
                <div className="vhc-print-footer-col">
                    <PrintLine label="Paid Under O.R. No." value={record.or_number} />
                    <PrintLine label="Amount Paid" value={formatVhcPrintAmount(record.amount_paid)} />
                    <PrintLine label="Issued at" value={issuedAt} />
                </div>

                <div className="vhc-print-footer-col vhc-print-footer-center">
                    <p className="vhc-print-inspected-label">Inspected by:</p>
                    <div className="vhc-print-signature-line">{record.inspected_by || '\u00A0'}</div>
                    <p className="vhc-print-signature-caption">(Printed name, signature, and date)</p>
                </div>

                <div className="vhc-print-footer-col vhc-print-footer-right">
                    <p className="vhc-print-signatory-name">ATTY. BEATA HUMILDA O. OBSIOMA, DVM</p>
                    <p className="vhc-print-signatory-title">Veterinary Consultant</p>
                    <p className="vhc-print-signatory-meta">PRC License No.: 0002922 (Until May 31, 2026)</p>
                    <p className="vhc-print-signatory-meta">Contact No.: 0917-100-5471</p>
                </div>
            </footer>
        </div>
    );
}
