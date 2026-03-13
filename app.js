const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

createApp({
setup() {
    const currentTab = ref('schedule');
    const showSettings = ref(false);
    const showAddSchedule = ref(false);
    const showAddShopItem = ref(false);
    const showAddExpense = ref(false);
    
    // 彈窗與同步狀態
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
    const mapMode = ref('normal'); // 'normal' 是 Google 搜尋, 'mymap' 是你的地圖

    // --- 關鍵修改：更新為你提供的 Embed URL ---
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

    const checkPassword = () => {
        const pw = prompt("請輸入操作密碼");
        return pw === "1234";
    };

    const previewImage = (url) => {
        selectedImageUrl.value = url;
        showImageModal.value = true;
        nextTick(lucide.createIcons);
    };

    // --- 計算機邏輯 ---
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

    // --- 天氣預報 ---
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
                icon: (code) => {
                    if (code === 0) return '☀️';
                    if (code <= 3) return '🌤️';
                    if (code <= 48) return '☁️';
                    return '🌧️';
                }(data.daily.weather_code[i])
            })).slice(0, 5);
        } catch (e) { console.error(e); }
        loadingWeather.value = false;
    };

    // --- GitHub 同步 ---
    const syncToGitHub = async (isAuto = false) => {
        const currentCount = (Object.values(scheduleData.value).flat().length) + shoppingList.value.length + expenseList.value.length;
        if (isAuto && initialLoadedCount.value > 0 && initialLoadedCount.value - currentCount >= 5) return;
        if (!githubConfig.value.token) return;
        isSyncing.value = true;
        const url = `https://api.github.com/repos/${githubConfig.value.owner}/${githubConfig.value.repo}/contents/data.json`;
        try {
            const res = await fetch(url, { headers: { Authorization: `token ${githubConfig.value.token}` }, cache: 'no-store' });
            let sha = res.ok ? (await res.json()).sha : '';
            const content = btoa(unescape(encodeURIComponent(JSON.stringify({ schedule: scheduleData.value, shopping: shoppingList.value, expenses: expenseList.value, rates: exchangeRates.value }))));
            await fetch(url, { method: 'PUT', headers: { Authorization: `token ${githubConfig.value.token}` }, body: JSON.stringify({ message: 'sync', content, sha: sha || undefined }) });
        } catch (e) { console.error(e); } finally { isSyncing.value = false; }
    };

    const fetchFromGitHub = async () => {
        if (!githubConfig.value.token) return;
        isSyncing.value = true;
        try {
            const res = await fetch(`https://api.github.com/repos/${githubConfig.value.owner}/${githubConfig.value.repo}/contents/data.json`, { headers: { Authorization: `token ${githubConfig.value.token}` }, cache: 'no-store' });
            if (res.ok) {
                const data = JSON.parse(decodeURIComponent(escape(atob((await res.json()).content))));
                scheduleData.value = data.schedule || {}; shoppingList.value = data.shopping || []; expenseList.value = data.expenses || [];
                if (data.rates) exchangeRates.value = data.rates;
            }
        } catch (e) { console.error(e); } finally { isSyncing.value = false; }
    };

    // --- 輔助功能 ---
    const saveToGitHubAuto = () => syncToGitHub(true);

    onMounted(async () => { await fetchFromGitHub(); lucide.createIcons(); });
    watch(currentTab, () => { nextTick(lucide.createIcons); selectedDate.value = null; });
    watch(githubConfig, (v) => localStorage.setItem('github_config', JSON.stringify(v)), { deep: true });
    watch(exchangeRates, (v) => localStorage.setItem('exchange_rates', JSON.stringify(v)), { deep: true });

    return {
        currentTab, showSettings, showAddSchedule, showAddShopItem, showAddExpense, selectedDate, dateRange, shopCategories, shopFilter, githubConfig,
        newScheduleItem, editingScheduleId, newShopItem, editingShopId, newExpense, editingExpenseId, peopleConfigs,
        showWeatherModal, showCalcModal, showImageModal, selectedImageUrl, previewImage, loadingWeather, weatherData, calcExpression, calcJpy, exchangeRates, openWeather,
        isSyncing, calcAppend, calcClear, calcBackspace, calcResult,
        activeTabTitle: computed(() => tabs.find(t => t.id === currentTab.value)?.name),
        
        // --- 關鍵修改：地圖 URL 計算邏輯 ---
        mapSrc: computed(() => {
            if (mapMode.value === 'mymap') {
                return myMapUrl;
            }
            return `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery.value)}&output=embed`;
        }),

        tabs: [{ id: 'schedule', name: '行程', icon: 'calendar' }, { id: 'map', name: '地圖', icon: 'map' }, { id: 'shopping', name: '清單', icon: 'shopping-bag' }, { id: 'expense', name: '支出', icon: 'banknote' }],
        sortedShoppingList: computed(() => { 
            let list = [...shoppingList.value]; 
            if (shopFilter.value !== 'all') list = list.filter(i => i.category === shopFilter.value); 
            return list.sort((a, b) => (a.done !== b.done) ? (a.done ? 1 : -1) : a.id - b.id); 
        }),
        totalEstTransportPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '交通').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        totalEstDiningPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '飲食').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        totalEstAttractionsPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '景點').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        totalEstAccommodationPersonal: computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '住宿').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0)),
        
        toggleAddSchedule: () => { if(showAddSchedule.value) { editingScheduleId.value = null; showAddSchedule.value = false; } else { showAddSchedule.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); } },
        toggleAddShop: () => { if(showAddShopItem.value) { editingShopId.value = null; showAddShopItem.value = false; } else { showAddShopItem.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); } },
        toggleAddExpense: () => { if(showAddExpense.value) { editingExpenseId.value = null; showAddExpense.value = false; } else { showAddExpense.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); } },
        scrollToDate: (d) => { selectedDate.value = d; const id = d === 'summary' ? 'expense-summary' : (currentTab.value === 'expense' ? 'expense-date-' : 'date-') + d.replace('/', '-'); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        getScheduleByDate: (d) => scheduleData.value[d] || [],
        getDayTotal: (d) => expenseList.value.filter(i => i.date === d && i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0),
        getPersonStats, getDayPersonTotal, getExpensesByDate: (date) => expenseList.value.filter(i => i.date === date), getPersonDayMethod,
        getPersonColor: (n) => ({ '公數': '#91A0A5', '妃': '#8E9775', '爸媽': '#A79A89', '而': '#B77F70' }[n] || '#999'),
        getPersonBg: (n) => ({ '公數': 'bg-[#E6EAEB]', '爸媽': 'bg-[#ECE9E4]', '妃': 'bg-[#E9EBE2]', '而': 'bg-[#EFE2DE]' }[n] || 'bg-gray-100'),
        getCatStyle: (c) => ({ '交通': 'bg-[#91A0A5]', '景點': 'bg-[#8E9775]', '飲食': 'bg-[#B77F70]', '購物': 'bg-[#A79A89]', '住宿': 'bg-[#607D8B]' }[c] || 'bg-gray-500'),
        
        jumpToMap: (t) => { mapQuery.value = t; mapMode.value = 'normal'; currentTab.value = 'map'; },
        searchMap: (q) => { mapMode.value = 'normal'; mapQuery.value = q; },
        
        // 核心切換功能
        openMyMap: () => { 
            console.log("切換至我的地圖");
            mapMode.value = 'mymap'; 
        },

        addScheduleItem, deleteScheduleItem, editScheduleItem: (item, date) => { newScheduleItem.value = { ...item, date }; editingScheduleId.value = item.id; showAddSchedule.value = true; },
        cancelEditSchedule: () => { editingScheduleId.value = null; showAddSchedule.value = false; },
        addShopItem, deleteShopItem, editShopItem: (item) => { newShopItem.value = { ...item }; editingShopId.value = item.id; showAddShopItem.value = true; },
        cancelEditShop: () => { editingShopId.value = null; showAddShopItem.value = false; },
        addExpense, deleteExpense, editExpense: (i) => { newExpense.value = { ...i }; editingExpenseId.value = i.id; showAddExpense.value = true; },
        cancelEditExpense: () => { editingExpenseId.value = null; showAddExpense.value = false; },
        fetchFromGitHub, syncToGitHub,
        handleImageUpload: (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height, max = 800;
                    if (width > height) { if (width > max) { height *= max / width; width = max; } }
                    else { if (height > max) { width *= max / height; height = max; } }
                    canvas.width = width; canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    newShopItem.value.image = canvas.toDataURL('image/jpeg', 0.7);
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    };
}
}).mount('#app');
