/**
 * ==========================================
 * Marktkompass
 * V23.8.2
 * ==========================================
 *
 * Aktueller Marktstatus
 * + historische Einordnung der aktuellen
 *   Stressstufe
 *
 * Kein Kauf-/Verkaufssignal.
 */


/* ==========================================
   KONFIGURATION
========================================== */

const ACWI_FILE =
    "./data/market-data/msci_acwi_daily_clean.csv";

const VIX_FILE =
    "./data/market-data/vix_daily_clean.csv";

const SMA_PERIOD = 200;

const STRESS_START = 18;
const STRESS_HIGH = 25;
const STRESS_EXTREME = 50;
const STRESS_EXCEPTIONAL = 100;


/* ==========================================
   DOM
========================================== */

const startButton =
    document.getElementById("startButton");

const status =
    document.getElementById("status");


/* ==========================================
   FORMATIERUNG
========================================== */

function formatNumber(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    return Number(value).toFixed(2);
}

function formatPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "–";
    }

    const number = Number(value);
    const sign = number > 0 ? "+" : "";

    return `${sign}${number.toFixed(2)} %`;
}


/* ==========================================
   CSV LADEN
========================================== */

async function loadCsv(filename) {

    const response = await fetch(filename);

    if (!response.ok) {

        throw new Error(
            `CSV-Datei konnte nicht geladen werden: ${filename}`
        );

    }

    const text = await response.text();

    return parseCsv(text);

}


/* ==========================================
   CSV PARSEN
========================================== */

function parseCsv(csvText) {

    const lines =
        csvText
            .trim()
            .split(/\r?\n/)
            .filter(line => line.trim() !== "");


    if (lines.length < 2) {

        return [];

    }


    const separator =
        lines[0].includes(";")
            ? ";"
            : ",";


    const headers =
        lines[0]
            .split(separator)
            .map(h =>
                h.trim().toLowerCase()
            );


    const data = [];


    for (
        let i = 1;
        i < lines.length;
        i++
    ) {

        const values =
            lines[i]
                .split(separator)
                .map(v => v.trim());


        const row = {};


        headers.forEach(
            (header, index) => {

                row[header] =
                    values[index];

            }
        );


        const date =
            row.date ??
            row.timestamp ??
            null;


        const close =
            Number(row.close);


        if (
            !date ||
            !Number.isFinite(close)
        ) {

            continue;

        }


        data.push({

            date: date,

            close: close

        });

    }


    return data;

}


/* ==========================================
   DATEN ZUSAMMENFÜHREN
========================================== */

function mergeData(acwi, vix) {

    const vixMap =
        new Map();


    vix.forEach(item => {

        vixMap.set(
            String(item.date),
            Number(item.close)
        );

    });


    const merged = [];


    acwi.forEach(item => {

        const date =
            String(item.date);


        const vixValue =
            vixMap.get(date);


        if (
            Number.isFinite(
                Number(item.close)
            ) &&
            Number.isFinite(vixValue)
        ) {

            merged.push({

                date: date,

                acwi:
                    Number(item.close),

                vix:
                    vixValue

            });

        }

    });


    return merged;

}


/* ==========================================
   SMA 200
========================================== */

function calculateSMA(data, index) {

    if (
        index <
        SMA_PERIOD - 1
    ) {

        return null;

    }


    let sum = 0;


    for (
        let i =
            index - SMA_PERIOD + 1;
        i <= index;
        i++
    ) {

        sum += data[i].acwi;

    }


    return sum / SMA_PERIOD;

}


/* ==========================================
   STRESSSTUFE
========================================== */

function getStressLevel(
    stressPercent
) {

    if (
        stressPercent >=
        STRESS_EXCEPTIONAL
    ) {

        return STRESS_EXCEPTIONAL;

    }


    if (
        stressPercent >=
        STRESS_EXTREME
    ) {

        return STRESS_EXTREME;

    }


    if (
        stressPercent >=
        STRESS_HIGH
    ) {

        return STRESS_HIGH;

    }


    if (
        stressPercent >=
        STRESS_START
    ) {

        return STRESS_START;

    }


    return null;

}


/* ==========================================
   MARKTKOMPASS-ANALYSE
========================================== */

function analyzeMarket(data) {

    let stressActive =
        false;


    let stressStartDate =
        null;


    let stressStartVix =
        null;


    let highestStress =
        null;


    let eventLowAcwi =
        null;


    let eventLowDate =
        null;


    /*
     * Speichert für jede erreichte
     * Stressstufe den ACWI-Wert
     * beim erstmaligen Erreichen.
     */

    let levelData = {};


    let previousVix =
        null;


    let previousAcwiBelowSMA =
        false;


    const events = [];


    for (
        let i = 0;
        i < data.length;
        i++
    ) {

        const item =
            data[i];


        /* ----------------------------------
           SMA
        ---------------------------------- */

        item.sma200 =
            calculateSMA(
                data,
                i
            );


        if (
            item.sma200 === null
        ) {

            item.state =
                "DATENAUFBAU";

            previousVix =
                item.vix;

            continue;

        }


        /* ----------------------------------
           ACWI / SMA
        ---------------------------------- */

        item.acwiBelowSMA =
            item.acwi <
            item.sma200;


        /* ----------------------------------
           VIX-TAGESVERÄNDERUNG
        ---------------------------------- */

        item.vixChange =
            null;


        if (
            previousVix !== null &&
            previousVix !== 0
        ) {

            item.vixChange =
                (
                    (
                        item.vix -
                        previousVix
                    )
                    /
                    previousVix
                ) * 100;

        }


        /* ----------------------------------
           STRESSBEGINN
        ---------------------------------- */

        if (
            !stressActive &&
            item.acwiBelowSMA &&
            item.vixChange !== null &&
            item.vixChange >=
                STRESS_START
        ) {

            stressActive =
                true;


            stressStartDate =
                item.date;


            stressStartVix =
                item.vix;


            highestStress =
                STRESS_START;


            eventLowAcwi =
                item.acwi;


            eventLowDate =
                item.date;


            levelData = {

                18: {

                    date:
                        item.date,

                    acwi:
                        item.acwi

                }

            };

        }


        /* ----------------------------------
           LAUFENDES STRESSEREIGNIS
        ---------------------------------- */

        if (stressActive) {

            const stressPercent =
                (
                    (
                        item.vix -
                        stressStartVix
                    )
                    /
                    stressStartVix
                ) * 100;


            item.stressPercent =
                stressPercent;


            /* ACWI-Tief verfolgen */

            if (
                item.acwi <
                eventLowAcwi
            ) {

                eventLowAcwi =
                    item.acwi;


                eventLowDate =
                    item.date;

            }


            /* Aktuelle Stressstufe */

            const currentLevel =
                getStressLevel(
                    stressPercent
                );


            if (
                currentLevel !== null
            ) {

                highestStress =
                    Math.max(
                        highestStress,
                        currentLevel
                    );


                /*
                 * Ersten Zeitpunkt der
                 * jeweiligen Stufe speichern.
                 */

                if (
                    !levelData[
                        currentLevel
                    ]
                ) {

                    levelData[
                        currentLevel
                    ] = {

                        date:
                            item.date,

                        acwi:
                            item.acwi

                    };

                }

            }


            item.highestStress =
                highestStress;


            /* ----------------------------------
               ERHOLUNG
            ---------------------------------- */

            const crossedAboveSMA =
                previousAcwiBelowSMA &&
                !item.acwiBelowSMA;


            const vixFalling =
                item.vixChange !== null &&
                item.vixChange < 0;


            if (
                crossedAboveSMA &&
                vixFalling
            ) {

                events.push({

                    startDate:
                        stressStartDate,

                    startVix:
                        stressStartVix,

                    endDate:
                        item.date,

                    lowDate:
                        eventLowDate,

                    lowAcwi:
                        eventLowAcwi,

                    highestStress:
                        highestStress,

                    levelData:
                        levelData,

                    status:
                        "abgeschlossen"

                });


                item.state =
                    "ERHOLUNG BESTÄTIGT";


                stressActive =
                    false;


                stressStartDate =
                    null;


                stressStartVix =
                    null;


                highestStress =
                    null;


                eventLowAcwi =
                    null;


                eventLowDate =
                    null;


                levelData = {};

            }


            /* ----------------------------------
               STABILISIERUNG
            ---------------------------------- */

            else if (
                vixFalling &&
                item.acwiBelowSMA
            ) {

                item.state =
                    "STABILISIERUNG";

            }


            /* ----------------------------------
               STRESSSTUFEN
            ---------------------------------- */

            else if (
                stressPercent >=
                STRESS_EXCEPTIONAL
            ) {

                item.state =
                    "AUSSERGEWÖHNLICHER STRESS";

            }


            else if (
                stressPercent >=
                STRESS_EXTREME
            ) {

                item.state =
                    "STRESS EXTREM";

            }


            else if (
                stressPercent >=
                STRESS_HIGH
            ) {

                item.state =
                    "STRESS HOCH";

            }


            else {

                item.state =
                    "STRESS";

            }

        }


        /* ----------------------------------
           NORMAL / WARNUNG
        ---------------------------------- */

        else {

            if (
                item.acwiBelowSMA
            ) {

                item.state =
                    "WARNUNG";

            }

            else {

                item.state =
                    "NORMAL";

            }

        }


        previousAcwiBelowSMA =
            item.acwiBelowSMA;


        previousVix =
            item.vix;

    }


    /* --------------------------------------
       LAUFENDES EREIGNIS
    -------------------------------------- */

    if (stressActive) {

        events.push({

            startDate:
                stressStartDate,

            startVix:
                stressStartVix,

            endDate:
                null,

            lowDate:
                eventLowDate,

            lowAcwi:
                eventLowAcwi,

            highestStress:
                highestStress,

            levelData:
                levelData,

            status:
                "laufend"

        });

    }


    return {

        data:
            data,

        events:
            events,

        currentEvent:
            stressActive
                ? events[
                    events.length - 1
                ]
                : null

    };

}


let currentAnalysisData = [];

/* ==========================================
   HISTORISCHER REFERENZFALL
========================================== */

/*
 * Der Referenzfall ist ausschließlich zur
 * historischen Einordnung gedacht.
 *
 * Er beeinflusst NICHT den aktuellen
 * Marktstatus und ist KEINE Prognose.
 *
 * Auswahl in zwei Stufen:
 * 1. Nur abgeschlossene Ereignisse, die
 *    mindestens die aktuelle höchste
 *    Stressstufe erreicht haben.
 * 2. Vergleich des historischen Zustands
 *    mit dem aktuellen Zustand.
 *
 * Die Ereignisdauer wird bewusst stark
 * berücksichtigt, damit zeitlich völlig
 * unterschiedliche Verläufe nicht als
 * "ähnlich" erscheinen.
 */

function dateDifferenceDays(startDate, endDate) {

    const start =
        new Date(`${startDate}T00:00:00`);

    const end =
        new Date(`${endDate}T00:00:00`);

    if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime())
    ) {
        return null;
    }

    return Math.round(
        (end - start) /
        (1000 * 60 * 60 * 24)
    );
}


function getEventRows(event) {

    if (!currentAnalysisData.length) {
        return [];
    }

    const start =
        currentAnalysisData.findIndex(
            item =>
                item.date === event.startDate
        );

    if (start < 0) {
        return [];
    }

    let end =
        event.endDate === null
            ? currentAnalysisData.length - 1
            : currentAnalysisData.findIndex(
                item =>
                    item.date === event.endDate
            );

    if (end < start) {
        return [];
    }

    return currentAnalysisData.slice(
        start,
        end + 1
    );
}


function getComparableHistoricalPoint(
    event,
    currentEvent,
    currentLatest
) {

    const rows =
        getEventRows(event);

    if (!rows.length) {
        return null;
    }

    const currentStress =
        Number(currentLatest.stressPercent);

    const currentDistance =
        (
            (
                currentLatest.acwi -
                currentLatest.sma200
            )
            /
            currentLatest.sma200
        ) * 100;

    const currentDuration =
        dateDifferenceDays(
            currentEvent.startDate,
            currentLatest.date
        );

    if (
        !Number.isFinite(currentStress) ||
        !Number.isFinite(currentDistance) ||
        !Number.isFinite(currentDuration)
    ) {
        return null;
    }

    /*
     * Nur wirklich vergleichbare Stressintensitäten
     * zulassen. Toleranz: +/- 15 Prozentpunkte
     * um die aktuelle Stressintensität.
     *
     * Beispiel: aktuell +39,9 % -> Vergleichsbereich
     * ca. +24,9 % bis +54,9 %.
     * Damit kann kein Extremfall wie +137 % als
     * scheinbar ähnlicher Referenzfall erscheinen.
     */
    const stressTolerance = 15;
    const minComparableStress =
        Math.max(0, currentStress - stressTolerance);
    const maxComparableStress =
        currentStress + stressTolerance;

    const candidates = [];

    rows.forEach(item => {

        if (
            !Number.isFinite(item.stressPercent) ||
            !Number.isFinite(item.sma200)
        ) {
            return;
        }

        if (
            item.stressPercent <
                minComparableStress ||
            item.stressPercent >
                maxComparableStress
        ) {
            return;
        }

        const stressDifference =
            Math.abs(
                item.stressPercent -
                currentStress
            );

        const distance =
            (
                (
                    item.acwi -
                    item.sma200
                )
                /
                item.sma200
            ) * 100;

        const acwiChange =
            (
                (
                    item.acwi -
                    eventStartAcwi(event)
                )
                /
                eventStartAcwi(event)
            ) * 100;

        const duration =
            dateDifferenceDays(
                event.startDate,
                item.date
            );

        if (
            !Number.isFinite(distance) ||
            !Number.isFinite(acwiChange) ||
            !Number.isFinite(duration)
        ) {
            return;
        }

        /*
         * VIX-Niveau wird relativ betrachtet,
         * damit der absolute VIX nicht allein
         * über die Auswahl entscheidet.
         */
        const vixDifference =
            Math.abs(
                item.vix -
                currentLatest.vix
            );

        candidates.push({
            item,
            stressDifference,
            distance,
            acwiChange,
            duration,
            vixDifference
        });

    });

    if (!candidates.length) {
        return null;
    }

    /*
     * Zuerst werden die Kandidaten auf eine
     * plausible Zeitspanne begrenzt.
     *
     * Toleranz: 60 Tage oder 50 % der aktuellen
     * Ereignisdauer – je nachdem, was größer ist.
     */
    const durationTolerance =
        Math.max(
            60,
            currentDuration * 0.50
        );

    const durationFiltered =
        candidates.filter(
            candidate =>
                Math.abs(
                    candidate.duration -
                    currentDuration
                ) <= durationTolerance
        );

    const pool =
        durationFiltered.length
            ? durationFiltered
            : candidates;

    /*
     * Robuste Skalierung innerhalb des
     * Kandidatenpools. Dadurch dominiert kein
     * einzelnes Merkmal nur wegen seiner Einheit.
     */
    function range(values) {

        const min =
            Math.min(...values);

        const max =
            Math.max(...values);

        return max === min
            ? 1
            : max - min;
    }

    const stressRange =
        range(
            pool.map(
                candidate =>
                    candidate.stressDifference
            )
        );

    const distanceRange =
        range(
            pool.map(
                candidate =>
                    Math.abs(
                        candidate.distance -
                        currentDistance
                    )
            )
        );

    const acwiRange =
        range(
            pool.map(
                candidate =>
                    Math.abs(
                        candidate.acwiChange -
                        currentAcwiChange(
                            currentEvent,
                            currentLatest
                        )
                    )
            )
        );

    const durationRange =
        range(
            pool.map(
                candidate =>
                    Math.abs(
                        candidate.duration -
                        currentDuration
                    )
            )
        );

    const vixRange =
        range(
            pool.map(
                candidate =>
                    candidate.vixDifference
            )
        );

    pool.forEach(candidate => {

        const stressScore =
            candidate.stressDifference /
            stressRange;

        const distanceScore =
            Math.abs(
                candidate.distance -
                currentDistance
            ) /
            distanceRange;

        const acwiScore =
            Math.abs(
                candidate.acwiChange -
                currentAcwiChange(
                    currentEvent,
                    currentLatest
                )
            ) /
            acwiRange;

        const durationScore =
            Math.abs(
                candidate.duration -
                currentDuration
            ) /
            durationRange;

        const vixScore =
            candidate.vixDifference /
            vixRange;

        /*
         * Dauer bewusst mit dem höchsten
         * Einzelgewicht.
         */
        candidate.score =
            (stressScore * 0.20) +
            (distanceScore * 0.15) +
            (acwiScore * 0.20) +
            (durationScore * 0.30) +
            (vixScore * 0.15);

    });

    pool.sort(
        (a, b) =>
            a.score - b.score
    );

    return pool[0];
}


function eventStartAcwi(event) {

    const rows =
        getEventRows(event);

    return rows.length
        ? rows[0].acwi
        : null;
}


function currentAcwiChange(
    currentEvent,
    currentLatest
) {

    const startAcwi =
        eventStartAcwi(
            currentEvent
        );

    if (
        !Number.isFinite(startAcwi) ||
        startAcwi === 0
    ) {
        return null;
    }

    return (
        (
            currentLatest.acwi -
            startAcwi
        )
        /
        startAcwi
    ) * 100;
}


function renderHistoricalReference(
    result
) {

    const currentEvent =
        result.currentEvent;

    if (!currentEvent) {
        return "";
    }

    const latest =
        result.data[
            result.data.length - 1
        ];

    const currentLevel =
        currentEvent.highestStress;

    if (!currentLevel) {
        return "";
    }

    const completedEvents =
        result.events.filter(
            event =>
                event.status ===
                    "abgeschlossen" &&
                event.highestStress >=
                    currentLevel
        );

    if (!completedEvents.length) {

        return `
            <div style="
                margin-top:20px;
                padding-top:16px;
                border-top:1px solid #ccc;
            ">
                <strong>
                    Historischer Referenzfall
                </strong>

                <br><br>

                Für diese Stressstufe liegt
                noch kein abgeschlossener
                Referenzfall vor.
            </div>
        `;

    }

    const candidates =
        completedEvents
            .map(
                event =>
                    getComparableHistoricalPoint(
                        event,
                        currentEvent,
                        latest
                    )
            )
            .filter(
                candidate =>
                    candidate !== null
            );

    if (!candidates.length) {
        return "";
    }

    /*
     * getComparableHistoricalPoint liefert
     * bereits den jeweils besten Zeitpunkt
     * eines historischen Ereignisses.
     */
    candidates.sort(
        (a, b) =>
            a.score - b.score
    );

    const reference =
        candidates[0];

    const event =
        completedEvents.find(
            historicalEvent =>
                getEventRows(
                    historicalEvent
                ).some(
                    item =>
                        item.date ===
                        reference.item.date
                )
        );

    if (!event) {
        return "";
    }

    const historicalDistance =
        reference.distance;

    const historicalAcwiChange =
        reference.acwiChange;

    const historicalDuration =
        reference.duration;

    return `
        <div style="
            margin-top:20px;
            padding-top:16px;
            border-top:1px solid #ccc;
        ">

            <strong>
                Historischer Referenzfall
            </strong>

            <br><br>

            Vergleichbarer Zeitpunkt:
            <b>${reference.item.date}</b>

            <br>

            Stressereignis begann:
            ${event.startDate}

            <br>

            Stressniveau damals:
            ${formatPercent(
                reference.item.stressPercent
            )}

            <br>

            ACWI seit Stressbeginn:
            ${formatPercent(
                historicalAcwiChange
            )}

            <br>

            Abstand zur SMA200:
            ${formatPercent(
                historicalDistance
            )}

            <br>

            VIX:
            ${formatNumber(
                reference.item.vix
            )}

            <br>

            Dauer bis Vergleichszeitpunkt:
            ${historicalDuration} Tage

            <br>

            Ereignis beendet:
            ${event.endDate}

            <br><br>

            <small>
                Ähnlicher historischer Zustand
                zur Einordnung. Keine Prognose
                und kein Bestandteil der
                Statusberechnung.
            </small>

        </div>
    `;
}


/* ==========================================
   AUSGABE
========================================== */

function renderResults(result) {

    const data =
        result.data;


    const latest =
        data[data.length - 1];


    const distance =
        (
            (
                latest.acwi -
                latest.sma200
            )
            /
            latest.sma200
        ) * 100;


    const stressText =
        latest.stressPercent !==
            undefined

            ? formatPercent(
                latest.stressPercent
            )

            : "–";


    const highestText =
        latest.highestStress !==
            undefined

            ? `+${latest.highestStress} %`

            : "–";


    const comparison =
        renderHistoricalReference(
            result
        );


    status.innerHTML = `

        <h2>
            Marktkompass V23.8.2
        </h2>

        <strong>Stand:</strong>
        ${latest.date}

        <br><br>


        <strong>
            Aktueller Marktstatus
        </strong>

        <br>

        <b>
            ${latest.state}
        </b>

        <br><br>


        <strong>
            MSCI ACWI
        </strong>

        <br>

        Aktueller Wert:
        ${formatNumber(
            latest.acwi
        )}

        <br>

        200-Tage-Linie:
        ${formatNumber(
            latest.sma200
        )}

        <br>

        Abstand zur 200-Tage-Linie:
        ${formatPercent(
            distance
        )}

        <br><br>


        <strong>
            VIX
        </strong>

        <br>

        Aktueller VIX:
        ${formatNumber(
            latest.vix
        )}

        <br>

        Tagesveränderung:
        ${formatPercent(
            latest.vixChange
        )}

        <br><br>


        <strong>
            Stressentwicklung
        </strong>

        <br>

        Aktuell seit Stressbeginn:
        ${stressText}

        <br>

        Höchste erreichte Stressstufe:
        ${highestText}

        <br>


        ${comparison}

        <br><br>


        <small>
            Der Marktkompass ist ein
            Informations- und
            Beobachtungsinstrument
            und kein Kauf- oder
            Verkaufssignal.
        </small>

    `;

}


/* ==========================================
   HAUPTABLAUF
========================================== */

async function startSystem() {

    try {

        status.textContent =
            "Lade MSCI ACWI und VIX ...";


        const acwi =
            await loadCsv(
                ACWI_FILE
            );


        const vix =
            await loadCsv(
                VIX_FILE
            );


        if (!acwi.length) {

            throw new Error(
                "MSCI-ACWI-Daten sind leer."
            );

        }


        if (!vix.length) {

            throw new Error(
                "VIX-Daten sind leer."
            );

        }


        status.textContent =
            "Führe Marktkompass-Analyse durch ...";


        const merged =
            mergeData(
                acwi,
                vix
            );


        if (!merged.length) {

            throw new Error(
                "Keine gemeinsamen ACWI-/VIX-Daten gefunden."
            );

        }


        currentAnalysisData =
            merged;


        const result =
            analyzeMarket(
                merged
            );


        renderResults(
            result
        );

    }


    catch (error) {

        console.error(error);


        status.innerHTML = `

            <strong>
                Fehler
            </strong>

            <br><br>

            ${error.message}

        `;

    }

}


/* ==========================================
   START
========================================== */

if (startButton) {

    startButton.addEventListener(
        "click",
        startSystem
    );

}


if (status) {

    status.textContent =
        "Bereit";

}