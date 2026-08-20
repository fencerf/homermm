import axios from 'axios';

let serverTimezone = "UTC"; // Default
let isTimezoneFetched = false;

export const fetchServerTimezone = async () => {
    if (isTimezoneFetched) return serverTimezone;
    try {
        const response = await axios.get('/api/frontend/timezone');
        serverTimezone = response.data.timezone;
        isTimezoneFetched = true;
    } catch (e) {
        console.error("Failed to fetch server timezone", e);
    }
    return serverTimezone;
};

export const formatTime = (dateString, timezone = serverTimezone) => {
    if (!dateString) return "";
    try {
        const date = new Date(dateString);
        // The backend returns naïve datetime strings that are actually UTC.
        // We ensure it parses correctly as UTC by appending 'Z' if it's missing.
        const utcDateStr = dateString.endsWith('Z') ? dateString : dateString + 'Z';

        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: timezone,
            timeZoneName: 'short'
        }).format(new Date(utcDateStr));
    } catch (e) {
        return dateString;
    }
};
