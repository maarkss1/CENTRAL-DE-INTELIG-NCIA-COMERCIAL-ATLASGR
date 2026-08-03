import { Card } from '../../../components/ui/Card';
import { IconBot } from '../../../components/icons';

export function Roleplay() {
    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-4 border-b border-line pb-6">
                    <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center shadow-sm text-atlas-orange">
                        <IconBot className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-ink">Roleplay Hub</h1>
                        <p className="text-ink-2">Em desenvolvimento...</p>
                    </div>
                </div>
                <Card className="p-12 text-center text-ink-2 bg-surface">
                    <IconBot className="w-16 h-16 mx-auto mb-4 text-ink-2" />
                    <h2 className="text-xl font-medium mb-2">Em breve</h2>
                    <p>Esta funcionalidade está em construção.</p>
                </Card>
            </div>
        </div>
    );
}
