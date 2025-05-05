import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, CallbackQuery
import sqlite3
import os
import time
import aiohttp

API_TOKEN = os.getenv("BOT_TOKEN")
TON_API_KEY = "AG5ANRGCYZMXPNAAAAADIHIVLU72TEXOU3XDETLMUMSX66WCVJ4VATTDV7V4UXFEI425QCQ"

bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)

conn = sqlite3.connect('users.db')
cursor = conn.cursor()
cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        tap_power INTEGER DEFAULT 1,
        autoclicker_owned INTEGER DEFAULT 0,
        autoclicker_active INTEGER DEFAULT 0,
        autoclicker_start INTEGER DEFAULT 0,
        donation_confirmed INTEGER DEFAULT 0,
        referrals INTEGER DEFAULT 0
    )
''')
conn.commit()
DONATE_WALLET = "UQCvhujOBIxkeEYE63tOZqY1yh9vrNoeLKsHTG8RxO1II36y"

BOOSTS = {
    "x2_power": {"cost": 800, "duration": 3600},
    "x3_power": {"cost": 1000, "duration": 1800}
}
AUTCLICKER_COST = 20000
active_boosts = {}

def get_main_menu(user_id):
    cursor.execute("SELECT autoclicker_owned, autoclicker_active, autoclicker_start FROM users WHERE user_id = ?", (user_id,))
    owned, active, start = cursor.fetchone()
    now = int(time.time())
    cooldown = now - start if start else 21601

    if owned:
        if active:
            autoclick_btn = InlineKeyboardButton("🤖 Автокликер (активен)", callback_data="autoclicker")
        elif cooldown >= 21600:
            autoclick_btn = InlineKeyboardButton("🚀 Запустить автокликер", callback_data="autoclicker")
        else:
            mins = (21600 - cooldown) // 60
            autoclick_btn = InlineKeyboardButton(f"⏳ {mins} мин до активации", callback_data="autoclicker")
    else:
        autoclick_btn = InlineKeyboardButton(f"🛒 Купить автокликер ({AUTCLICKER_COST} WTK)", callback_data="autoclicker")

    menu = InlineKeyboardMarkup(row_width=2)
    menu.add(
        InlineKeyboardButton("🪙 TAP", callback_data="tap"),
        InlineKeyboardButton("📊 Баланс", callback_data="balance"),
        InlineKeyboardButton("⚡ Улучшить", callback_data="upgrade"),
        InlineKeyboardButton("🛒 Бусты", callback_data="shop"),
        autoclick_btn,
        InlineKeyboardButton("👥 Пригласить", callback_data="invite"),
        InlineKeyboardButton("💸 Донат", callback_data="donate")
    )
    return menu

BOOST_BUTTONS = InlineKeyboardMarkup(row_width=1)
BOOST_BUTTONS.add(
    InlineKeyboardButton("🟡 Купить x2 на 1 час (800 WTK)", callback_data="buy_x2"),
    InlineKeyboardButton("🔴 Купить x3 на 30 мин (1000 WTK)", callback_data="buy_x3")
)
@dp.message_handler(commands=['start'])
async def start(message: types.Message):
    user_id = message.from_user.id
    args = message.get_args()
    cursor.execute("INSERT OR IGNORE INTO users (user_id) VALUES (?)", (user_id,))
    if args.isdigit():
        referrer_id = int(args)
        if referrer_id != user_id:
            cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (referrer_id,))
            if cursor.fetchone():
                cursor.execute("UPDATE users SET balance = balance + 500, referrals = referrals + 1 WHERE user_id = ?", (referrer_id,))
    conn.commit()
    await message.answer("Добро пожаловать в WHERE TOKEN? Жми на кнопки ниже:", reply_markup=get_main_menu(user_id))

@dp.callback_query_handler(lambda c: c.data == 'tap')
async def handle_tap(callback_query: CallbackQuery):
    user_id = callback_query.from_user.id
    cursor.execute("SELECT balance, tap_power FROM users WHERE user_id = ?", (user_id,))
    result = cursor.fetchone()
    if result:
        balance, tap_power = result
        multiplier = 1
        if user_id in active_boosts and time.time() < active_boosts[user_id]['expires']:
            multiplier = int(active_boosts[user_id]['type'][1])
        elif user_id in active_boosts:
            del active_boosts[user_id]
        gain = tap_power * multiplier
        balance += gain
        cursor.execute("UPDATE users SET balance = ? WHERE user_id = ?", (balance, user_id))
        conn.commit()
        animation = "✨" * min(gain, 10)
        text = f"+{gain} WTK {animation}\nБаланс: {balance} WTK"
        await callback_query.message.edit_text(text, reply_markup=get_main_menu(user_id))
        await callback_query.answer()
@dp.callback_query_handler(lambda c: c.data == 'balance')
async def balance(callback_query: CallbackQuery):
    user_id = callback_query.from_user.id
    cursor.execute("SELECT balance, autoclicker_owned, autoclicker_active, autoclicker_start FROM users WHERE user_id = ?", (user_id,))
    balance, owned, active, start = cursor.fetchone()
    boost_text = ""
    if user_id in active_boosts:
        remaining = int(active_boosts[user_id]['expires'] - time.time())
        if remaining > 0:
            boost_text += f"\nАктивен буст {active_boosts[user_id]['type'].upper()} на {remaining // 60} мин."
    if owned:
        if active:
            boost_text += "\nАвтокликер: активен ✅"
        else:
            cooldown = int(time.time()) - start if start else 21601
            if cooldown >= 21600:
                boost_text += "\nАвтокликер: готов к запуску"
            else:
                boost_text += f"\nАвтокликер: на перезарядке {(21600 - cooldown) // 60} мин"
    await callback_query.message.edit_text(f"Баланс: {balance} WTK{boost_text}", reply_markup=get_main_menu(user_id))
    await callback_query.answer()

@dp.callback_query_handler(lambda c: c.data == 'upgrade')
async def upgrade(callback_query: CallbackQuery):
    user_id = callback_query.from_user.id
    cursor.execute("SELECT balance, tap_power FROM users WHERE user_id = ?", (user_id,))
    balance, power = cursor.fetchone()
    if power >= 10:
        await callback_query.message.edit_text("Максимальный уровень достигнут.", reply_markup=get_main_menu(user_id))
    elif balance >= 800:
        cursor.execute("UPDATE users SET tap_power = ?, balance = ? WHERE user_id = ?", (power + 1, balance - 800, user_id))
        conn.commit()
        await callback_query.message.edit_text(f"Тап улучшен до {power + 1}! Баланс: {balance - 800} WTK", reply_markup=get_main_menu(user_id))
    else:
        await callback_query.message.edit_text("Недостаточно WTK для улучшения (нужно 800).", reply_markup=get_main_menu(user_id))
    await callback_query.answer()

@dp.callback_query_handler(lambda c: c.data == 'shop')
async def shop(callback_query: CallbackQuery):
    await callback_query.message.edit_text("Выбери буст:", reply_markup=BOOST_BUTTONS)
    await callback_query.answer()

@dp.callback_query_handler(lambda c: c.data in ['buy_x2', 'buy_x3'])
async def inline_buy_boost(callback_query: CallbackQuery):
    user_id = callback_query.from_user.id
    boost_type = callback_query.data.replace("buy_", "")
    cost = BOOSTS[boost_type]["cost"]
    duration = BOOSTS[boost_type]["duration"]
    cursor.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,))
    balance = cursor.fetchone()[0]
    if balance >= cost:
        cursor.execute("UPDATE users SET balance = balance - ? WHERE user_id = ?", (cost, user_id))
        conn.commit()
        active_boosts[user_id] = {"type": boost_type, "expires": time.time() + duration}
        await callback_query.message.edit_text(f"Буст {boost_type.upper()} активирован на {duration // 60} мин!", reply_markup=get_main_menu(user_id))
    else:
        await callback_query.message.edit_text("Недостаточно WTK для покупки буста.", reply_markup=get_main_menu(user_id))
    await callback_query.answer()
@dp.callback_query_handler(lambda c: c.data == 'autoclicker')
async def activate_autoclicker(callback_query: CallbackQuery):
    user_id = callback_query.from_user.id
    cursor.execute("SELECT balance, autoclicker_owned, autoclicker_active, autoclicker_start FROM users WHERE user_id = ?", (user_id,))
    balance, owned, active, start = cursor.fetchone()

    now = int(time.time())
    cooldown = now - start if start else 21601

    if not owned and balance >= AUTCLICKER_COST:
        cursor.execute("UPDATE users SET balance = balance - ?, autoclicker_owned = 1 WHERE user_id = ?", (AUTCLICKER_COST, user_id))
        conn.commit()
        await callback_query.message.edit_text("Автокликер куплен! Теперь ты можешь активировать его каждые 6 часов.", reply_markup=get_main_menu(user_id))

    elif owned:
        if active:
            await callback_query.message.edit_text("Автокликер уже активен!", reply_markup=get_main_menu(user_id))
        elif cooldown >= 21600:
            cursor.execute("UPDATE users SET autoclicker_active = 1, autoclicker_start = ? WHERE user_id = ?", (now, user_id))
            conn.commit()
            await callback_query.message.edit_text("Автокликер активирован на 6 часов.", reply_markup=get_main_menu(user_id))
        else:
            remaining = 21600 - cooldown
            mins = remaining // 60
            await callback_query.message.edit_text(f"Нельзя активировать автокликер. Подожди {mins} мин.", reply_markup=get_main_menu(user_id))
    else:
        await callback_query.message.edit_text(f"Автокликер стоит {AUTCLICKER_COST} WTK. Баланс: {balance} WTK", reply_markup=get_main_menu(user_id))
    await callback_query.answer()

@dp.callback_query_handler(lambda c: c.data == 'invite')
async def invite(callback_query: CallbackQuery):
    user_id = callback_query.from_user.id
    await callback_query.message.edit_text(
        f"Приглашай друзей и получай 500 WTK!\n\nТвоя ссылка:\nhttps://t.me/YourBotUsername?start={user_id}",
        reply_markup=get_main_menu(user_id)
    )
    await callback_query.answer()

@dp.callback_query_handler(lambda c: c.data == 'donate')
async def donate(callback_query: CallbackQuery):
    user_id = callback_query.from_user.id
    await callback_query.message.edit_text(
        f"Для получения 10,000 WTK отправь 1 USDT (TON) на адрес:\n`{DONATE_WALLET}`\n\n"
        f"❗ В комментарии (memo) укажи: `{user_id}`\n"
        f"Затем нажми /claim для получения токенов.",
        parse_mode='Markdown',
        reply_markup=get_main_menu(user_id)
    )
    await callback_query.answer()
@dp.message_handler(commands=['claim'])
async def claim(message: types.Message):
    user_id = message.from_user.id
    cursor.execute("SELECT donation_confirmed FROM users WHERE user_id = ?", (user_id,))
    result = cursor.fetchone()
    if result and result[0]:
        await message.answer("Ты уже получил бонус за донат 💸")
        return

    headers = {"Authorization": f"Bearer {TON_API_KEY}"}
    async with aiohttp.ClientSession() as session:
        async with session.get(f"https://tonapi.io/v2/blockchain/accounts/{DONATE_WALLET}/transactions", headers=headers) as resp:
            data = await resp.json()
            for tx in data.get("transactions", []):
                if tx.get("in_msg", {}).get("value") == "1000000":
                    comment = tx.get("in_msg", {}).get("comment", "")
                    if str(user_id) == comment:
                        cursor.execute("UPDATE users SET balance = balance + 10000, donation_confirmed = 1 WHERE user_id = ?", (user_id,))
                        conn.commit()
                        await message.answer("Транзакция подтверждена! Ты получил 10,000 WTK 💸")
                        return
    await message.answer("❌ Платёж не найден. Убедись, что указал memo и отправил точно 1 USDT.")

async def autoclicker_loop():
    while True:
        now = int(time.time())
        cursor.execute("SELECT user_id, autoclicker_start FROM users WHERE autoclicker_active = 1")
        for user_id, start_time in cursor.fetchall():
            elapsed = now - start_time
            if elapsed > 21600:
                cursor.execute("UPDATE users SET autoclicker_active = 0 WHERE user_id = ?", (user_id,))
                continue
            gain = int(2000 / 21600)
            cursor.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (gain, user_id))
        conn.commit()
        await asyncio.sleep(40)

async def main():
    asyncio.create_task(autoclicker_loop())
    await dp.start_polling()

if __name__ == '__main__':
    asyncio.run(main())
