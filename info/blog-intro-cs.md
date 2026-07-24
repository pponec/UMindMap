# UMind: Pište myšlenkové mapy jako seznam.

**UMind** je minimalistická webová aplikace pro tvorbu myšlenkových map. Myšlenky zapisujete jako obyčejnou vnořenou osnovu a jedním kliknutím je převedete na přehlednou SVG myšlenkovou mapu. Všechno běží lokálně v prohlížeči – bez účtu a bez závislostí, přitom vaše data neopustí lokální prohlížeč.

Mnoho konkurenčních aplikací pro myšlenkové mapy staví na ručním kreslení a přetahování uzlů. UMind jde opačnou cestou. Nejdříve se soustředíte na obsah a strukturu, teprve potom z ní aplikace automaticky vytvoří graf. Nemusíte řešit rozmisťování uzlů ani vzhled výsledku. Jako ukázku si projdeme jednoduchý příklad: plánování víkendového výletu.

---

Myšlenková mapa je vizuální nástroj pro organizaci nápadů, plánování i efektivnější učení. Místo dlouhého lineárního textu využívá stromovou strukturu. Vše začíná hlavním tématem, z něhož vyrůstají hlavní větve představující jednotlivé oblasti, které se dále větví do konkrétních poznámek, nápadů nebo příkladů. Tento způsob práce dobře odpovídá tomu, jak přirozeně uvažujeme – přes souvislosti a asociace – takže je snazší udržet přehled i zapamatovat si informace.

**UMind** je malá aplikace pro vytváření právě takových stromových struktur. Každý uzel obsahuje krátký titulek a volitelně také delší popis: odstavec poznámek, tabulku, odkaz, kontrolní seznam nebo cokoli dalšího, co by jinak skončilo v jiném dokumentu či poznámkovém bloku.

Celá aplikace je statická webová stránka tvořená několika soubory HTML, JavaScriptu a CSS. Nepotřebuje build, žádné závislosti ani serverový backend. Neobsahuje telemetrii a vše probíhá lokálně ve vašem prohlížeči, takže žádná data neopouštějí váš počítač.

Díky tomu není potřeba nic instalovat. Můžete používat veřejně hostovanou verzi, nebo si aplikaci zkopírovat na vlastní web, firemní server či USB disk. Funguje i bez připojení k internetu. Protože neexistuje žádný server, není potřeba zakládat účet ani řešit hesla nebo registrace.

Mapy se průběžně ukládají do `localStorage`, takže zůstávají uložené v konkrétním prohlížeči na daném počítači. Tlačítko **Save** uloží celý dokument do textového souboru `.json`, který můžete archivovat, sdílet nebo otevřít na jiném zařízení pomocí tlačítka **Open**.

Aplikaci lze spustit také lokálně. Součástí projektu jsou dva jednoduché pomocné skripty, které spustí malý webový server – jeden využívá Python 3 (`python3 run.py`), druhý Javu 17+ (`java Run.java`). Oba zpřístupní aplikaci na adrese `http://localhost:8000/`. Otevření `index.html` přímo přes `file://` sice často funguje, některé prohlížeče ale v tomto režimu omezují `localStorage`, takže použití lokálního serveru je spolehlivější.

Při práci dostává přednost klávesnice. Nový uzel na stejné úrovni vytvoříte klávesou <kbd>Enter</kbd>, o úroveň hlouběji se dostanete pomocí <kbd>Tab</kbd> a zpět kombinací <kbd>Shift</kbd>+<kbd>Tab</kbd>. Dialog s podrobným popisem otevřete klávesami <kbd>Alt</kbd>+<kbd>Enter</kbd>. Myš slouží hlavně k přesouvání větví nebo jejich sbalování. Obsah vzniká v editačním režimu a jediným kliknutím na **Show graph** se převede do grafické podoby. Rozhraní aplikace je anglické, jak je vidět i na obrázcích níže.

## Editační režim: jak vzniká plán

![UMind v editačním režimu: osnova výletu vlevo, popis vybraného uzlu vpravo](img-edit.png)

Představme si, že s týmem plánujeme víkendový výlet, ale zatím neznáme všechny podrobnosti. Cíl cesty se stane kořenem mapy. Hned pod něj přidáme základní otázky: jak se tam dostaneme, kde budeme spát, co chceme vidět, kde se najíme a co je potřeba zařídit před odjezdem. Během několika minut vznikne kostra celé mapy a všechny další informace už mají své místo.

Odpovědi přicházejí postupně a často v náhodném pořadí. Kolega doporučí starý most při východu slunce, takže vznikne nový uzel pod *What to see* a do jeho popisu se uloží vysvětlení, proč právě ráno.

Srovnání vlaku, nočního autobusu a letadla může být malou tabulkou v popisu uzlu *Getting there* spolu s krátkým závěrem: vlak vítězí, protože jede z centra do centra. O týden později už nikdo nemusí znovu otevírat několik záložek a hledat, proč byla jiná varianta zamítnuta.

Osnova se přitom může průběžně měnit. *Beer garden by the river* se nejprve objeví mezi památkami a později se přesune pod *Food & drink*. Klávesy <kbd>Alt</kbd>+<kbd>↑</kbd> a <kbd>Alt</kbd>+<kbd>↓</kbd> umožní změnit pořadí uzlů, hotové větve lze sbalit a soustředit se jen na rozpracované části. Titulky zůstávají přehledné, všechny související informace jsou na jednom místě a plán se nerozpadne do několika různých dokumentů.

## Prezentační režim: stejný dokument jako přehledný graf

![Tatáž mapa v prezentačním režimu: kořen uprostřed, větve na obě strany, popisy vykreslené jako poznámky](img-graph.png)

Jediným kliknutím se textová osnova převede na přehlednou myšlenkovou mapu. Hlavní téma zůstane uprostřed, větve se automaticky rozloží po obou stranách a vedle uzlů se zobrazí i jejich podrobné poznámky, které lze formátovat pomocí základního Markdownu.

Rozvržení počítá aplikace automaticky, takže není potřeba ručně přesouvat jednotlivé uzly. Výslednou mapu lze stáhnout jako jediný soubor SVG, který bez problémů otevře běžný prohlížeč i mobilní telefon.

S kolegy můžete sdílet buď hotový obrázek, nebo přímo zdrojový soubor JSON, který si každý otevře a upraví ve své vlastní kopii aplikace. Soubor lze poslat e-mailem nebo uložit do Git repozitáře.

Pokud si UMind hostujete sami – například zdarma na GitHub Pages – stačí ponechat soubor `vylet.json` vedle aplikace. Mapu pak lze otevřít přímo pomocí adresy `...?vylet.json`, aniž by návštěvník cokoli instaloval.

Sdílení je bezpečné už z principu fungování aplikace. UMind tvoří pouze HTML, CSS a JavaScript běžící v prohlížeči. Nemá přístup k cizím souborům ani nespouští žádné programy na počítači návštěvníka. Statický hosting, například GitHub Pages, navíc žádný kód na serveru nevykonává – pouze poskytuje statické soubory. Sdílená mapa tedy umí jedinou věc: zobrazit svůj obsah. Pokud ji chce někdo upravit, klikne na **Edit map** a vytvoří si vlastní kopii ve svém prohlížeči.

## Shrnutí

Cílem není vytvořit hezký obrázek, ale dojít k lepšímu rozhodnutí.

UMind staví na jednoduché myšlence: osnova je místo, kde vznikají nápady, graf je způsob jejich prezentace. Obojí tvoří soubory, které zůstávají ve vašich rukou. Bez účtu, bez cloudové služby, bez instalace a bez závislosti na tom, jestli nějaká online služba bude existovat i za několik let.

Pokud si chcete UMind vyzkoušet, připravená uvítací mapa je na adrese:

https://pponec.github.io/UMind/?welcome

Zdrojové kódy projektu (čistý JavaScript, bez frameworků a buildu, licence Apache 2.0) najdete na GitHubu:

https://github.com/pponec/UMind

Zkuste si v něm naplánovat příští výlet, připravit přednášku nebo udělat rešerši. Možná zjistíte, že vám poprvé stačí jediný dokument místo několika otevřených záložek.