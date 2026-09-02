/**
 * PDFExport — exportação de documentos como PDF usando @react-pdf/renderer
 *
 * Suporta dois modos:
 *   1. ScriptPDFExport — script de vendas gerado pelo Hub de IA
 *   2. DocumentPDFExport — documento da Base de Conhecimento
 *
 * Uso:
 *   // Botão que abre o PDF em nova aba:
 *   <PDFDownloadButton document={<ScriptDocument data={scriptData} />} fileName="script.pdf" />
 *
 *   // Inline (preview no browser):
 *   <PDFViewer width="100%" height={600}>
 *     <ScriptDocument data={scriptData} />
 *   </PDFViewer>
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
  Font,
  type DocumentProps,
} from '@react-pdf/renderer';
import { Download, Loader2 } from 'lucide-react';

// Registra fontes (fallback para Helvetica — sem CORS, funciona offline)
Font.registerHyphenationCallback((word) => [word]);

// ─────────────────────────────────────────────────────────────────────────────
// Estilos compartilhados
// ─────────────────────────────────────────────────────────────────────────────
const BASE_STYLES = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    padding: 40,
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: '#F97316',
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#6B7280',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#F97316',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  body: {
    fontSize: 10,
    color: '#374151',
    lineHeight: 1.6,
  },
  callout: {
    backgroundColor: '#FFF7ED',
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
    padding: 10,
    marginBottom: 10,
    borderRadius: 4,
  },
  calloutText: {
    fontSize: 10,
    color: '#92400E',
    lineHeight: 1.5,
  },
  badge: {
    backgroundColor: '#F97316',
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    padding: '3 8',
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#9CA3AF',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  col: {
    flex: 1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ScriptDocument — Script de Vendas
// ─────────────────────────────────────────────────────────────────────────────
export interface ScriptDocumentData {
  title: string;
  companyName?: string;
  contactName?: string;
  generatedAt: string;
  opening?: string;
  qualification?: string[];
  pitch?: string;
  objectionHandling?: { objection: string; response: string }[];
  closing?: string;
  nextSteps?: string[];
}

export function ScriptDocument({ data }: { data: ScriptDocumentData }) {
  return (
    <Document
      title={data.title}
      author="AtlasGR — Central de Inteligência Comercial"
      creator="AtlasGR"
    >
      <Page size="A4" style={BASE_STYLES.page}>
        {/* Header */}
        <View style={BASE_STYLES.header}>
          <Text style={BASE_STYLES.title}>{data.title}</Text>
          <Text style={BASE_STYLES.subtitle}>
            AtlasGR · Central de Inteligência Comercial
            {data.companyName ? ` · ${data.companyName}` : ''}
            {data.contactName ? ` · ${data.contactName}` : ''}
          </Text>
          <Text style={[BASE_STYLES.subtitle, { marginTop: 4 }]}>Gerado em {data.generatedAt}</Text>
        </View>

        {/* Abertura */}
        {data.opening && (
          <View style={BASE_STYLES.section}>
            <Text style={BASE_STYLES.sectionTitle}>📞 Abertura</Text>
            <View style={BASE_STYLES.callout}>
              <Text style={BASE_STYLES.calloutText}>{data.opening}</Text>
            </View>
          </View>
        )}

        {/* Qualificação */}
        {data.qualification && data.qualification.length > 0 && (
          <View style={BASE_STYLES.section}>
            <Text style={BASE_STYLES.sectionTitle}>🎯 Perguntas de Qualificação</Text>
            {data.qualification.map((q, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text
                  style={[
                    BASE_STYLES.body,
                    { width: 20, color: '#F97316', fontFamily: 'Helvetica-Bold' },
                  ]}
                >
                  {i + 1}.
                </Text>
                <Text style={[BASE_STYLES.body, { flex: 1 }]}>{q}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Pitch */}
        {data.pitch && (
          <View style={BASE_STYLES.section}>
            <Text style={BASE_STYLES.sectionTitle}>💡 Pitch de Valor</Text>
            <Text style={BASE_STYLES.body}>{data.pitch}</Text>
          </View>
        )}

        {/* Objeções */}
        {data.objectionHandling && data.objectionHandling.length > 0 && (
          <View style={BASE_STYLES.section}>
            <Text style={BASE_STYLES.sectionTitle}>🛡️ Tratamento de Objeções</Text>
            {data.objectionHandling.map((item, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <Text
                  style={[
                    BASE_STYLES.body,
                    { fontFamily: 'Helvetica-Bold', color: '#DC2626', marginBottom: 3 },
                  ]}
                >
                  Objeção: {item.objection}
                </Text>
                <Text style={[BASE_STYLES.body, { color: '#374151' }]}>
                  Resposta: {item.response}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Fechamento */}
        {data.closing && (
          <View style={BASE_STYLES.section}>
            <Text style={BASE_STYLES.sectionTitle}>🏁 Fechamento</Text>
            <View style={BASE_STYLES.callout}>
              <Text style={BASE_STYLES.calloutText}>{data.closing}</Text>
            </View>
          </View>
        )}

        {/* Próximos passos */}
        {data.nextSteps && data.nextSteps.length > 0 && (
          <View style={BASE_STYLES.section}>
            <Text style={BASE_STYLES.sectionTitle}>✅ Próximos Passos</Text>
            {data.nextSteps.map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={[BASE_STYLES.body, { width: 16, color: '#16A34A' }]}>☑</Text>
                <Text style={[BASE_STYLES.body, { flex: 1 }]}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={BASE_STYLES.footer} fixed>
          <Text style={BASE_STYLES.footerText}>AtlasGR — Confidencial</Text>
          <Text
            style={BASE_STYLES.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDFDownloadButton — botão de download com loading state
// ─────────────────────────────────────────────────────────────────────────────
interface PDFDownloadButtonProps {
  document: React.ReactElement<DocumentProps>;
  fileName: string;
  label?: string;
  className?: string;
}

export function PDFDownloadButton({
  document: doc,
  fileName,
  label = 'Exportar PDF',
  className = '',
}: PDFDownloadButtonProps) {
  return (
    <PDFDownloadLink
      document={doc}
      fileName={fileName}
      className={`inline-flex items-center gap-2 rounded-xl bg-brand-active px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      {({ loading }) =>
        loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            {label}
          </>
        )
      }
    </PDFDownloadLink>
  );
}
