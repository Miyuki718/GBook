import Link from 'next/link';
export default function NotFound(){return <main className="settings-page"><h1>这本书暂时不在书架上</h1><p>可能已被移出书架，或链接不正确。可以在“连接与数据”中恢复移出的书。</p><Link className="primary-button" href="/">返回书架</Link></main>;}
