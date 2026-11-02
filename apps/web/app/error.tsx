'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main className="settings-page"><h1>暂时无法打开这一页</h1><p>请检查本地数据目录是否可写，以及数据库初始化是否成功。你的阅读资料仍保留在本机。</p><div className="action-row"><button className="primary-button" onClick={reset}>重试</button><Link href="/">返回书架</Link></div></main>;}
