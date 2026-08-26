package br.com.atlasgr.prospector;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * ACHADO (Onda 4/Roadmap v2, Agente 09): este arquivo era o boilerplate padrão gerado por
 * `npx cap add android` (pacote `com.getcapacitor.myapp`, package name esperado
 * "com.getcapacitor.app") e nunca foi adaptado para o app real — ou seja, `assertEquals`
 * comparava contra um applicationId que nunca existiu neste projeto (`applicationId` real é
 * "br.com.atlasgr.prospector", ver android/app/build.gradle). Rodar `connectedAndroidTest` falharia
 * sempre. Corrigido: pacote e asserção agora refletem o app real.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() throws Exception {
        // Context of the app under test.
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("br.com.atlasgr.prospector", appContext.getPackageName());
    }
}
