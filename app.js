const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

createApp({
setup() {
    const currentTab = ref('schedule');
    const showSettings = ref(false);
    const showAddSchedule = ref(false);
    const showAddShopItem = ref(false);
    const showAddExpense = ref(false);
    
    const showWeatherModal = ref(false);
    const showCalcModal = ref(false);
    const showImageModal = ref(false); 
    const loadingWeather = ref(false);
    const weatherData = ref([]);
    const calcExpression = ref(''); 
    const calcJpy = ref(0);
    const selectedImageUrl = ref('');
    const isSyncing = ref(false);
    const initialLoadedCount = ref(0);

    const selectedDate = ref(null);
    const mapQuery = ref('東京');
    const mapMode = ref('normal');
    const myMapUrl = 'https://www.google.com/maps/d/embed?mid=1BH1Wp-fTNOady5xFfHqKO5MSHP2hNOM&ehbc=2E312F&noprof=1';
    const dateRange = ['29/3', '30/3', '31/3', '1/4', '2/4', '3/4', '4/4', '5/4', '6/4', '7/4'];
    const shopCategories = ['3COINS', 'LOFT', '藥妝', '百貨公司', '便利店', '超市', '其他'];
    const shopFilter = ref('all');
    const githubConfig = ref(JSON.parse(localStorage.getItem('github_config')) || { owner: '', repo: '', token: '' });
    
    const exchangeRates = ref(JSON.parse(localStorage.getItem('exchange_rates')) || {
        baMa: 0.052, fei: 0.052, yi: 0.052
    });

    const scheduleData = ref({});
    const shoppingList = ref([]);
    const expenseList = ref([]);

    const newScheduleItem = ref({ date: '29/3', time: '09:00', title: '', category: '', estPersonal: null, estShared: null, address: '', desc: '' });
    const editingScheduleId = ref(null);
    const newShopItem = ref({ name: '', store: '', category: '其他', image: null });
    const editingShopId = ref(null);
    const newExpense = ref({ type: 'expense', date: '29/3', person: '公數', method: '現金', title: '', amount: null });
    const editingExpenseId = ref(null);

    const peopleConfigs = [
        { name: '公數', colorClass: 'bg-[#E6EAEB]' }, { name: '爸媽', colorClass: 'bg-[#ECE9E4]' },
        { name: '妃', colorClass: 'bg-[#E9EBE2]' }, { name: '而', colorClass: 'bg-[#EFE2DE]' }
    ];

    // --- 梅花間竹主題邏輯 ---
    const getDateTheme = (date) => {
        const idx = dateRange.indexOf(date);
        const cycle = idx % 3;
        if (cycle === 0) return { shadow: 'shadow-[#91A0A5]', text: 'text-[#91A0A5]', bg: 'bg-[#91A0A5]', lightBg: 'bg-[#F0F4F5]' }; 
        if (cycle === 1) return { shadow: 'shadow-[#B77F70]', text: 'text-[#B77F70]', bg: 'bg-[#B77F70]', lightBg: 'bg-[#F5F0EE]' }; 
        return { shadow: 'shadow-[#8E9775]', text: 'text-[#8E9775]', bg: 'bg-[#8E9775]', lightBg: 'bg-[#F1F2ED]' }; 
    };

    const checkPassword = () => {
        const pw = prompt("請輸入操作密碼");
        if (pw === null) return false; 
        if (pw === "1234") return true; 
        alert("密碼錯誤，請重新輸入。");
        return false;
    };

    const previewImage = (url) => {
        selectedImageUrl.value = url;
        showImageModal.value = true;
        nextTick(lucide.createIcons);
    };

    const getTotalItemCount = () => {
        const scheduleCount = Object.values(scheduleData.value).flat().length;
        return scheduleCount + shoppingList.value.length + expenseList.value.length;
    };

    const calcAppend = (char) => {
        const lastChar = calcExpression.value.slice(-1);
        const operators = ['+', '-', '*', '/', '.'];
        if (operators.includes(char) && operators.includes(lastChar)) return;
        calcExpression.value += char;
        updateCalcResult();
    };
    const calcClear = () => { calcExpression.value = ''; calcJpy.value = 0; };
    const calcBackspace = () => { calcExpression.value = calcExpression.value.slice(0, -1); updateCalcResult(); };
    const calcResult = () => { updateCalcResult(); calcExpression.value = calcJpy.value.toString(); };
    const updateCalcResult = () => {
        if (!calcExpression.value) { calcJpy.value = 0; return; }
        try {
            const result = new Function(`return ${calcExpression.value}`)();
            if (isFinite(result)) calcJpy.value = Math.max(0, Math.round(result));
        } catch (e) {}
    };

    const openWeather = async () => {
        showWeatherModal.value = true;
        nextTick(lucide.createIcons);
        if (weatherData.value.length > 0) return;
        loadingWeather.value = true;
        try {
            const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo');
            const data = await res.json();
            weatherData.value = data.daily.time.map((t, i) => ({
                date: t.split('-').slice(1).join('/'),
                tempMax: Math.round(data.daily.temperature_2m_max[i]),
                tempMin: Math.round(data.daily.temperature_2m_min[i]),
                icon: (code => {
                    if (code === 0) return '☀️';
                    if (code <= 3) return '🌤️';
                    if (code <= 48) return '☁️';
                    if (code <= 67) return '🌧️';
                    if (code <= 77) return '❄️';
                    if (code <= 99) return '⛈️';
                    return '🌡️';
                })(data.daily.weather_code[i])
            })).slice(0, 5);
        } catch (e) { console.error("天氣失敗", e); }
        loadingWeather.value = false;
    };

    const syncToGitHub = async (isAuto = false) => {
        const currentCount = getTotalItemCount();
        if (isAuto) {
            if (currentCount === 0 && initialLoadedCount.value > 0) return;
            if (initialLoadedCount.value - currentCount >= 5) {
                alert("⚠️ 暫停自動同步：偵測到大量資料被移除。\n\n如需同步請使用手動上傳。");
                return;
            }
        }
        if (!githubConfig.value.token || !githubConfig.value.owner || !githubConfig.value.repo) return;
        isSyncing.value = true;
        const url = `https://api.github.com/repos/${githubConfig.value.owner}/${githubConfig.value.repo}/contents/data.json`;
        try {
            const getRes = await fetch(url, { headers: { Authorization: `token ${githubConfig.value.token}` }, cache: 'no-store' });
            let sha = '';
            if (getRes.ok) {
                const fileData = await getRes.json();
                sha = fileData.sha;
            }
            const content = btoa(unescape(encodeURIComponent(JSON.stringify({ 
                schedule: scheduleData.value, 
                shopping: shoppingList.value, 
                expenses: expenseList.value, 
                rates: exchangeRates.value 
            }))));
            const putRes = await fetch(url, { 
                method: 'PUT', 
                headers: { Authorization: `token ${githubConfig.value.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'sync', content, sha: sha || undefined }) 
            });
            if (putRes.ok) {
                if (!isAuto) alert('🚀 同步成功！');
                initialLoadedCount.value = currentCount;
            }
        } catch (e) { alert("網路連線錯誤。"); } finally { isSyncing.value = false; }
    };

    const fetchFromGitHub = async () => {
        if (!githubConfig.value.token) return;
        isSyncing.value = true;
        const url = `https://api.github.com/repos/${githubConfig.value.owner}/${githubConfig.value.repo}/contents/data.json`;
        try {
            const res = await fetch(url, { headers: { Authorization: `token ${githubConfig.value.token}` }, cache: 'no-store' });
            if (res.ok) {
                const file = await res.json();
                const data = JSON.parse(decodeURIComponent(escape(atob(file.content))));
                scheduleData.value = data.schedule || {}; 
                shoppingList.value = data.shopping || []; 
                expenseList.value = data.expenses || [];
                if (data.rates) exchangeRates.value = data.rates;
                nextTick(() => { initialLoadedCount.value = getTotalItemCount(); });
            }
        } catch (e) { console.error(e); }
        isSyncing.value = false;
    };

    const addScheduleItem = () => {
        if (!newScheduleItem.value.title) return;
        const date = newScheduleItem.value.date;
        if (!scheduleData.value[date]) scheduleData.value[date] = [];
        if (editingScheduleId.value) {
            if(!checkPassword()) return;
            const idx = scheduleData.value[date].findIndex(i => i.id === editingScheduleId.value);
            if (idx !== -1) scheduleData.value[date][idx] = { ...newScheduleItem.value };
            editingScheduleId.value = null;
        } else {
            scheduleData.value[date].push({ ...newScheduleItem.value, id: Date.now() });
        }
        scheduleData.value[date].sort((a, b) => a.time.localeCompare(b.time));
        newScheduleItem.value = { date: '29/3', time: '09:00', title: '', category: '', estPersonal: null, estShared: null, address: '', desc: '' };
        showAddSchedule.value = false; 
        syncToGitHub(true); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const addShopItem = () => {
        if (!newShopItem.value.name) return;
        if (editingShopId.value) {
            if(!checkPassword()) return;
            const idx = shoppingList.value.findIndex(s => s.id === editingShopId.value);
            if(idx !== -1) shoppingList.value[idx] = { ...newShopItem.value, id: editingShopId.value };
            editingShopId.value = null;
        } else { shoppingList.value.push({ ...newShopItem.value, id: Date.now(), done: false }); }
        newShopItem.value = { name: '', store: '', category: '其他', image: null };
        showAddShopItem.value = false; 
        syncToGitHub(true); 
    };

    const addExpense = () => {
        if (!newExpense.value.title || !newExpense.value.amount) return;
        if (editingExpenseId.value) {
            if(!checkPassword()) return;
            const idx = expenseList.value.findIndex(e => e.id === editingExpenseId.value);
            if(idx !== -1) expenseList.value[idx] = { ...newExpense.value, id: editingExpenseId.value };
            editingExpenseId.value = null;
        } else { expenseList.value.push({ ...newExpense.value, id: Date.now() }); }
        newExpense.value = { type: 'expense', date: '29/3', person: '公數', method: '現金', title: '', amount: null };
        showAddExpense.value = false; 
        syncToGitHub(true); 
    };

    const getPersonStats = (name) => {
        let stats = { cashSpent: 0, creditSpent: 0, debitSpent: 0, cashBalance: 0, totalSpent: 0 };
        expenseList.value.forEach(item => { if (item.person === name) { const amt = Number(item.amount); if (item.type === 'expense') { stats.totalSpent += amt; if (item.method === '現金') { stats.cashSpent += amt; stats.cashBalance -= amt; } else if (item.method === '信用卡') { stats.creditSpent += amt; } else if (item.method === '扣賬卡') { stats.debitSpent += amt; } } else if (item.method === '現金') stats.cashBalance += amt; } });
        return stats;
    };

    onMounted(async () => { await fetchFromGitHub(); lucide.createIcons(); });
    watch(currentTab, () => { nextTick(lucide.createIcons); selectedDate.value = null; });
    watch([showSettings, showAddSchedule, showAddShopItem, showAddExpense, showWeatherModal, showCalcModal, showImageModal, scheduleData, shoppingList, expenseList], () => nextTick(lucide.createIcons), { deep: true });

    return {
        currentTab, showSettings, showAddSchedule, showAddShopItem, showAddExpense, selectedDate, dateRange, shopCategories, shopFilter, githubConfig,
        newScheduleItem, editingScheduleId, newShopItem, editingShopId, newExpense, editingExpenseId, peopleConfigs,
        showWeatherModal, showCalcModal, showImageModal, selectedImageUrl, previewImage, loadingWeather, weatherData, calcExpression, calcJpy, exchangeRates, openWeather,
        isSyncing, calcAppend, calcClear, calcBackspace, calcResult,
        activeTabTitle: computed(() => ({'schedule':'行程','map':'地圖','shopping':'清單','expense':'支出'}[currentTab.value])),
        mapSrc: computed(() => mapMode.value === 'mymap' ? myMapUrl : `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery.value)}&output=embed`),
        tabs: [{ id: 'schedule', name: '行程', icon: 'calendar' }, { id: 'map', name: '地圖', icon: 'map' }, { id: 'shopping', name: '清單', icon: 'shopping-bag' }, { id: 'expense', name: '支出', icon: 'banknote' }],
        sortedShoppingList: computed(() => { let list = [...shoppingList.value]; if (shopFilter.value !== 'all') list = list.filter(i => i.category === shopFilter.value); return list.sort((a, b) => (a.done !== b.done) ? (a.done ? 1 : -1) : a.id - b.id); }),
        totalEstTransportPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '交通').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        totalEstDiningPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '飲食').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        totalEstAttractionsPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '景點').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        totalEstAccommodationPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '住宿').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        scrollToDate: (d) => { selectedDate.value = d; const id = d === 'summary' ? 'expense-summary' : (currentTab.value === 'expense' ? 'expense-date-' : 'date-') + d.replace('/', '-'); const el = document.getElementById(id); if(el) window.scrollTo({ top: el.offsetTop - 145, behavior: 'smooth' }); },
        getScheduleByDate: (d) => scheduleData.value[d] || [],
        getDayTotal: (d) => expenseList.value.filter(i => i.date === d && i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0),
        getPersonStats, getDayPersonTotal: (date, person) => expenseList.value.filter(i => i.date === date && i.person === person && i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0),
        getExpensesByDate: (date) => expenseList.value.filter(i => i.date === date),
        getPersonColor: (n) => ({ '公數': '#91A0A5', '妃': '#8E9775', '爸媽': '#A79A89', '而': '#B77F70' }[n] || '#999'),
        getCatStyle: (c) => ({ '交通': 'bg-[#91A0A5]', '景點': 'bg-[#8E9775]', '飲食': 'bg-[#B77F70]', '購物': 'bg-[#A79A89]', '住宿': 'bg-[#607D8B]' }[c] || 'bg-gray-500'),
        getDateTheme, addScheduleItem, addShopItem, addExpense, fetchFromGitHub, syncToGitHub,
        toggleAddSchedule: () => { if(showAddSchedule.value) {editingScheduleId.value=null; showAddSchedule.value=false;} else {showAddSchedule.value=true; window.scrollTo({top:0,behavior:'smooth'});}},
        toggleAddShop: () => { if(showAddShopItem.value) {editingShopId.value=null; showAddShopItem.value=false;} else {showAddShopItem.value=true; window.scrollTo({top:0,behavior:'smooth'});}},
        toggleAddExpense: () => { if(showAddExpense.value) {editingExpenseId.value=null; showAddExpense.value=false;} else {showAddExpense.value=true; window.scrollTo({top:0,behavior:'smooth'});}},
        editScheduleItem: (item, date) => { newScheduleItem.value = { ...item, date }; editingScheduleId.value = item.id; showAddSchedule.value = true; window.scrollTo({ top: 0, behavior: 'smooth' }); },
        deleteScheduleItem: (d, i) => { if(checkPassword()) { scheduleData.value[d].splice(i, 1); syncToGitHub(true); } },
        editShopItem: (item) => { newShopItem.value = { ...item }; editingShopId.value = item.id; showAddShopItem.value = true; window.scrollTo({ top: 0, behavior: 'smooth' }); },
        deleteShopItem: (id) => { if(checkPassword()) { shoppingList.value = shoppingList.value.filter(s => s.id !== id); syncToGitHub(true); } },
        editExpense: (i) => { newExpense.value = { ...i }; editingExpenseId.value = i.id; showAddExpense.value = true; window.scrollTo({ top: 0, behavior: 'smooth' }); },
        deleteExpense: (id) => { if(checkPassword()) { expenseList.value = expenseList.value.filter(e => e.id !== id); syncToGitHub(true); } },
        jumpToMap: (t) => { mapQuery.value = t; mapMode.value = 'normal'; currentTab.value = 'map'; },
        searchMap: (q) => { mapMode.value = 'normal'; mapQuery.value = q; },
        openMyMap: () => mapMode.value = 'mymap',
        saveToGitHubAuto: () => syncToGitHub(true),
        handleImageUpload: (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height, max = 800;
                    if (w > h) { if (w > max) { h *= max / w; w = max; } } else { if (h > max) { w *= max / h; h = max; } }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    newShopItem.value.image = canvas.toDataURL('image/jpeg', 0.7);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    };
}
}).mount('#app');
