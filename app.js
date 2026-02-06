const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

createApp({
setup() {
    const currentTab = ref('schedule');
    const showSettings = ref(false);
    const showAddSchedule = ref(false);
    const showAddShopItem = ref(false);
    const showAddExpense = ref(false);
    
    // 彈窗狀態
    const showWeatherModal = ref(false);
    const showCalcModal = ref(false);
    const showImageModal = ref(false); 
    const loadingWeather = ref(false);
    const weatherData = ref([]);
    const calcExpression = ref(''); 
    const calcJpy = ref(0);
    const selectedImageUrl = ref('');

    // 新增：同步鎖定狀態 (對應 index.html 的遮罩)
    const isSyncing = ref(false);

    // 安全保護機制
    const initialLoadedCount = ref(0);

    const selectedDate = ref(null);
    const mapQuery = ref('東京');
    const mapMode = ref('normal');
    const myMapUrl = 'https://www.google.com/maps/d/u/0/embed?mid=1mR-HqP7E_1Uu3_YnOqA9mK1j_18';
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

    // --- 修改：密碼核對功能 (增加錯誤提示) ---
    const checkPassword = () => {
        const pw = prompt("請輸入操作密碼");
        if (pw === null) return false; // 
        if (pw === "1234") return true; // 
        alert("密碼錯誤，請重新輸入。");
        return false;
    };

    const previewImage = (url) => {
        selectedImageUrl.value = url;
        showImageModal.value = true;
        nextTick(lucide.createIcons);
    };

    // 計算總項目數 (保護機制)
    const getTotalItemCount = () => {
        const scheduleCount = Object.values(scheduleData.value).flat().length;
        return scheduleCount + shoppingList.value.length + expenseList.value.length;
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
    const getWeatherIcon = (code) => {
        if (code === 0) return '☀️';
        if (code <= 3) return '🌤️';
        if (code <= 48) return '☁️';
        if (code <= 67) return '🌧️';
        if (code <= 77) return '❄️';
        if (code <= 99) return '⛈️';
        return '🌡️';
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
                icon: getWeatherIcon(data.daily.weather_code[i])
            })).slice(0, 5);
        } catch (e) { console.error("天氣失敗", e); }
        loadingWeather.value = false;
    };

    // --- 修改：GitHub 同步 (加入安全保護與同步鎖定) ---
    const syncToGitHub = async (isAuto = false) => {
        const currentCount = getTotalItemCount();

        // 安全護欄
        if (isAuto) {
            if (currentCount === 0 && initialLoadedCount.value > 0) {
                console.warn("偵測到資料為空白，取消自動同步。");
                return;
            }
            if (initialLoadedCount.value - currentCount >= 5) {
                alert("⚠️ 暫停自動同步：偵測到大量資料被移除(超過5個項目)。\n\n如需同步請使用手動上傳。");
                return;
            }
        }

        if (!githubConfig.value.token || !githubConfig.value.owner || !githubConfig.value.repo) return;

        // 開啟同步鎖定
        isSyncing.value = true;

        const url = `https://api.github.com/repos/${githubConfig.value.owner}/${githubConfig.value.repo}/contents/data.json`;
        
        try {
            // 1. 先抓取最新 SHA，防止因快速重複新增造成的版本衝突
            const getRes = await fetch(url, { 
                headers: { Authorization: `token ${githubConfig.value.token}` },
                cache: 'no-store' 
            });
            
            let sha = '';
            if (getRes.ok) {
                const fileData = await getRes.json();
                sha = fileData.sha;
            }

            // 2. 準備內容
            const content = btoa(unescape(encodeURIComponent(JSON.stringify({ 
                schedule: scheduleData.value, 
                shopping: shoppingList.value, 
                expenses: expenseList.value, 
                rates: exchangeRates.value 
            }))));

            // 3. 上傳更新
            const putRes = await fetch(url, { 
                method: 'PUT', 
                headers: { Authorization: `token ${githubConfig.value.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'sync', content, sha: sha || undefined }) 
            });

            if (putRes.ok) {
                if (!isAuto) alert('🚀 同步成功！');
                initialLoadedCount.value = currentCount; // 更新基準線
            } else {
                const err = await putRes.json();
                alert("上傳失敗: " + err.message);
            }
        } catch (e) { 
            console.error(e);
            alert("網路連線錯誤，無法完成同步。");
        } finally {
            // 關閉同步鎖定
            isSyncing.value = false;
        }
    };

    const fetchFromGitHub = async () => {
        if (!githubConfig.value.token) return;
        isSyncing.value = true; // 下載期間也鎖定
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

    const saveToGitHubAuto = () => syncToGitHub(true);

    // --- 各功能邏輯 ---
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
        saveToGitHubAuto(); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const editScheduleItem = (item, date) => { newScheduleItem.value = { ...item, date }; editingScheduleId.value = item.id; showAddSchedule.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); };
    const cancelEditSchedule = () => { editingScheduleId.value = null; newScheduleItem.value = { date: '29/3', time: '09:00', title: '', category: '', estPersonal: null, estShared: null, address: '', desc: '' }; showAddSchedule.value = false; };
    const deleteScheduleItem = (d, i) => { if(checkPassword()) { scheduleData.value[d].splice(i, 1); saveToGitHubAuto(); } };
    
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
        saveToGitHubAuto(); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const editShopItem = (item) => { newShopItem.value = { ...item }; editingShopId.value = item.id; showAddShopItem.value = true; nextTick(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); lucide.createIcons(); }); };
    const cancelEditShop = () => { editingShopId.value = null; newShopItem.value = { name: '', store: '', category: '其他', image: null }; showAddShopItem.value = false; };
    const deleteShopItem = (id) => { if(checkPassword()) { shoppingList.value = shoppingList.value.filter(s => s.id !== id); saveToGitHubAuto(); } };
    
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
        saveToGitHubAuto(); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const cancelEditExpense = () => { editingExpenseId.value = null; newExpense.value = { type: 'expense', date: '29/3', person: '公數', method: '現金', title: '', amount: null }; showAddExpense.value = false; };
    const editExpense = (i) => { newExpense.value = { ...i }; editingExpenseId.value = i.id; showAddExpense.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); };
    const deleteExpense = (id) => { if(checkPassword()) { expenseList.value = expenseList.value.filter(e => e.id !== id); saveToGitHubAuto(); } };

    const totalEstTransportPersonal = computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '交通').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0));
    const totalEstDiningPersonal = computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '飲食').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0));
    const totalEstAttractionsPersonal = computed(() => Object.values(scheduleData.value).flat().filter(i => i.category === '景點').reduce((s, i) => s + (Number(i.estPersonal)||0) + ((Number(i.estShared)||0)/4), 0));

    const getPersonStats = (name) => {
        let stats = { cashSpent: 0, creditSpent: 0, debitSpent: 0, cashBalance: 0, totalSpent: 0 };
        expenseList.value.forEach(item => { if (item.person === name) { const amt = Number(item.amount); if (item.type === 'expense') { stats.totalSpent += amt; if (item.method === '現金') { stats.cashSpent += amt; stats.cashBalance -= amt; } else if (item.method === '信用卡') { stats.creditSpent += amt; } else if (item.method === '扣賬卡') { stats.debitSpent += amt; } } else if (item.method === '現金') stats.cashBalance += amt; } });
        return stats;
    };
    const getPersonDayMethod = (date, person, method) => expenseList.value.filter(i => i.date === date && i.person === person && i.method === method && i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0);
    const getDayPersonTotal = (date, person) => expenseList.value.filter(i => i.date === date && i.person === person && i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0);

    const tabs = [{ id: 'schedule', name: '行程', icon: 'calendar' }, { id: 'map', name: '地圖', icon: 'map' }, { id: 'shopping', name: '清單', icon: 'shopping-bag' }, { id: 'expense', name: '支出', icon: 'banknote' }];

    onMounted(async () => { await fetchFromGitHub(); lucide.createIcons(); });
    watch(currentTab, () => { nextTick(lucide.createIcons); selectedDate.value = null; });
    watch(githubConfig, (v) => localStorage.setItem('github_config', JSON.stringify(v)), { deep: true });
    watch(exchangeRates, (v) => localStorage.setItem('exchange_rates', JSON.stringify(v)), { deep: true });
    watch([showSettings, showAddSchedule, showAddShopItem, showAddExpense, showWeatherModal, showCalcModal, showImageModal, scheduleData, shoppingList, expenseList], () => nextTick(lucide.createIcons), { deep: true });

    return {
        currentTab, showSettings, showAddSchedule, showAddShopItem, showAddExpense, selectedDate, dateRange, shopCategories, shopFilter, githubConfig,
        newScheduleItem, editingScheduleId, newShopItem, editingShopId, newExpense, editingExpenseId, peopleConfigs,
        showWeatherModal, showCalcModal, showImageModal, selectedImageUrl, previewImage, loadingWeather, weatherData, calcExpression, calcJpy, exchangeRates, openWeather,
        isSyncing, // 返回給 index 使用
        calcAppend, calcClear, calcBackspace, calcResult,
        activeTabTitle: computed(() => tabs.find(t => t.id === currentTab.value)?.name),
        mapSrc: computed(() => mapMode.value === 'mymap' ? myMapUrl : `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery.value)}&output=embed`),
        tabs, sortedShoppingList: computed(() => { let list = [...shoppingList.value]; if (shopFilter.value !== 'all') list = list.filter(i => i.category === shopFilter.value); return list.sort((a, b) => (a.done !== b.done) ? (a.done ? 1 : -1) : a.id - b.id); }),
        totalEstTransportPersonal, totalEstDiningPersonal, totalEstAttractionsPersonal,
        toggleAddSchedule: () => { if(showAddSchedule.value) cancelEditSchedule(); else { showAddSchedule.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); } },
        toggleAddShop: () => { if(showAddShopItem.value) cancelEditShop(); else { showAddShopItem.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); } },
        toggleAddExpense: () => { if(showAddExpense.value) cancelEditExpense(); else { showAddExpense.value = true; nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' })); } },
        scrollToDate: (d) => { selectedDate.value = d; const id = d === 'summary' ? 'expense-summary' : (currentTab.value === 'expense' ? 'expense-date-' : 'date-') + d.replace('/', '-'); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        getScheduleByDate: (d) => scheduleData.value[d] || [],
        getDayTotal: (d) => expenseList.value.filter(i => i.date === d && i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0),
        getPersonStats, getDayPersonTotal, getExpensesByDate: (date) => expenseList.value.filter(i => i.date === date), getPersonDayMethod,
        getPersonColor: (n) => ({ '公數': '#91A0A5', '妃': '#8E9775', '爸媽': '#A79A89', '而': '#B77F70' }[n] || '#999'),
        getPersonBg: (n) => ({ '公數': 'bg-[#E6EAEB]', '爸媽': 'bg-[#ECE9E4]', '妃': 'bg-[#E9EBE2]', '而': 'bg-[#EFE2DE]' }[n] || 'bg-gray-100'),
        getCatStyle: (c) => ({ '交通': 'bg-[#91A0A5]', '景點': 'bg-[#8E9775]', '飲食': 'bg-[#B77F70]', '購物': 'bg-[#A79A89]' }[c] || 'bg-gray-500'),
        jumpToMap: (t) => { mapQuery.value = t; mapMode.value = 'normal'; currentTab.value = 'map'; },
        searchMap: (q) => { mapMode.value = 'normal'; mapQuery.value = q; },
        openMyMap: () => mapMode.value = 'mymap',
        addScheduleItem, deleteScheduleItem, editScheduleItem, cancelEditSchedule,
        addShopItem, editShopItem, cancelEditShop, deleteShopItem,
        addExpense, cancelEditExpense, editExpense, deleteExpense,
        fetchFromGitHub, syncToGitHub, handleImageUpload: (e) => {
            if (!e.target.files[0]) return;
            const reader = new FileReader();
            reader.onload = (ev) => { newShopItem.value.image = ev.target.result; };
            reader.readAsDataURL(e.target.files[0]);
        }
    };
}
}).mount('#app');
