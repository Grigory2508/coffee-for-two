import { render } from 'preact';
import { detectLang, setLang } from './i18n';
import { tg } from './platform/telegram';
import { App } from './ui/App';
import '@fontsource/nunito/cyrillic-700.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/cyrillic-900.css';
import '@fontsource/nunito/latin-900.css';
import './ui/styles.css';

tg.init();
setLang(detectLang(tg.user()?.language_code ?? navigator.language));
render(<App />, document.getElementById('app')!);
