import { Card } from '../../../components/ui/Card';
import { IconClipboard } from '../../../components/icons';

export function EditorDocumentos() {
    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-4 border-b border-gray-200 pb-6">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-atlas-orange">
                        <IconClipboard className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Documentos</h1>
                        <p className="text-gray-500">Em desenvolvimento...</p>
                    </div>
                </div>
                <Card className="p-12 text-center text-gray-500 bg-white">
                    <IconClipboard className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <h2 className="text-xl font-medium mb-2">Em breve</h2>
                    <p>Esta funcionalidade está em construção.</p>
                </Card>
            </div>
        </div>
    );
}
