set_global('$', global.make_zjquery());
set_global('i18n', global.stub_i18n);

set_global('page_params', {
    use_websockets: false,
});

set_global('document', {
    location: {
    },
});
set_global('channel', {});
set_global('templates', {});

var noop = function () {};

set_global('blueslip', {});
set_global('drafts', {
    delete_draft_after_send: noop,
});
set_global('resize', {
    resize_bottom_whitespace: noop,
});
set_global('feature_flags', {
    resize_bottom_whitespace: noop,
});
set_global('echo', {});

// Setting these up so that we can test that links to uploads within messages are
// automatically converted to server relative links.
global.document.location.protocol = 'https:';
global.document.location.host = 'foo.com';

add_dependencies({
    common: 'js/common',
    compose_state: 'js/compose_state',
    compose_ui: 'js/compose_ui.js',
    Handlebars: 'handlebars',
    people: 'js/people',
    stream_data: 'js/stream_data',
    util: 'js/util',
});

var compose = require('js/compose.js');

var me = {
    email: 'me@example.com',
    user_id: 30,
    full_name: 'Me Myself',
};

var alice = {
    email: 'alice@example.com',
    user_id: 31,
    full_name: 'Alice',
};

var bob = {
    email: 'bob@example.com',
    user_id: 32,
    full_name: 'Bob',
};

people.add(me);
people.initialize_current_user(me.user_id);

people.add(alice);
people.add(bob);

(function test_update_email() {
    compose_state.recipient('');
    assert.equal(compose.update_email(), undefined);

    compose_state.recipient('bob@example.com');
    compose.update_email(32, 'bob_alias@example.com');
    assert.equal(compose_state.recipient(), 'bob_alias@example.com');
}());

(function test_validate_stream_message_address_info() {
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);
    assert(compose.validate_stream_message_address_info('social'));

    $('#stream').select(noop);
    assert(!compose.validate_stream_message_address_info('foobar'));
    assert.equal($('#error-msg').html(), "<p>The stream <b>foobar</b> does not exist.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    sub.subscribed = false;
    stream_data.add_sub('social', sub);
    assert(!compose.validate_stream_message_address_info('social'));
    assert.equal($('#error-msg').html(), "<p>You're not subscribed to the stream <b>social</b>.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    global.page_params.narrow_stream = false;
    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'social');
        payload.data.subscribed = true;
        payload.success(payload.data);
    };
    assert(compose.validate_stream_message_address_info('social'));

    sub.name = 'Frontend';
    sub.stream_id = 102;
    stream_data.add_sub('Frontend', sub);
    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'Frontend');
        payload.data.subscribed = false;
        payload.success(payload.data);
    };
    assert(!compose.validate_stream_message_address_info('Frontend'));
    assert.equal($('#error-msg').html(), "<p>You're not subscribed to the stream <b>Frontend</b>.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'Frontend');
        payload.error({status: 404});
    };
    assert(!compose.validate_stream_message_address_info('Frontend'));
    assert.equal($('#error-msg').html(), "<p>The stream <b>Frontend</b> does not exist.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'social');
        payload.error({status: 500});
    };
    assert(!compose.validate_stream_message_address_info('social'));
    assert.equal($('#error-msg').html(), i18n.t("Error checking subscription"));
}());

(function test_validate() {
    $("#compose-send-button").removeAttr('disabled');
    $("#compose-send-button").focus();
    $("#sending-indicator").hide();
    $("#new_message_content").select(noop);
    assert(!compose.validate());
    assert(!$("#sending-indicator").visible());
    assert(!$("#compose-send-button").is_focused());
    assert.equal($("#compose-send-button").attr('disabled'), undefined);
    assert.equal($('#error-msg').html(), i18n.t('You have nothing to send!'));

    $("#new_message_content").val('foobarfoobar');
    var zephyr_checked = false;
    $("#zephyr-mirror-error").is = function () {
        if (!zephyr_checked) {
            zephyr_checked = true;
            return true;
        }
        return false;
    };
    assert(!compose.validate());
    assert(zephyr_checked);
    assert.equal($('#error-msg').html(), i18n.t('You need to be running Zephyr mirroring in order to send messages!'));

    compose_state.set_message_type('private');
    compose_state.recipient('');
    $("#private_message_recipient").select(noop);
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('Please specify at least one recipient'));

    compose_state.recipient('foo@zulip.com');
    global.page_params.realm_is_zephyr_mirror_realm = true;
    assert(compose.validate());

    global.page_params.realm_is_zephyr_mirror_realm = false;
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('The recipient foo@zulip.com is not valid', {}));

    compose_state.recipient('foo@zulip.com,alice@zulip.com');
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('The recipients foo@zulip.com,alice@zulip.com are not valid', {}));

    people.add_in_realm(bob);
    compose_state.recipient('bob@example.com');
    assert(compose.validate());

    compose_state.set_message_type('stream');
    compose_state.stream_name('');
    $("#stream").select(noop);
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('Please specify a stream'));

    compose_state.stream_name('Denmark');
    global.page_params.realm_mandatory_topics = true;
    compose_state.subject('');
    $("#subject").select(noop);
    assert(!compose.validate());
    assert.equal($('#error-msg').html(), i18n.t('Please specify a topic'));
}());

(function test_get_invalid_recipient_emails() {
    var feedback_bot = {
        email: 'feedback@example.com',
        user_id: 124,
        full_name: 'Feedback Bot',
    };
    global.page_params.cross_realm_bots = [feedback_bot];
    global.page_params.user_id = 30;
    people.initialize();
    compose_state.recipient('feedback@example.com');
    assert.deepEqual(compose.get_invalid_recipient_emails(), []);
}());

(function test_validate_stream_message() {
    // This test is in kind of continuation to test_validate but since it is
    // primarly used to get coverage over functions called from validate()
    // we are seperating it up in different test. Though their relative position
    // of execution should not be changed.
    global.page_params.realm_mandatory_topics = false;
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);
    compose_state.stream_name('social');
    assert(compose.validate());
    assert(!$("#compose-all-everyone").visible());
    assert(!$("#send-status").visible());

    stream_data.get_subscriber_count = function (stream_name) {
        assert.equal(stream_name, 'social');
        return 16;
    };
    global.templates.render = function (template_name, data) {
        assert.equal(template_name, 'compose_all_everyone');
        assert.equal(data.count, 16);
        return 'compose_all_everyone_stub';
    };
    $('#compose-all-everyone').is = function (sel) {
        if (sel === ':visible') {
            return $('#compose-all-everyone').visible();
        }
    };
    var compose_content;
    $('#compose-all-everyone').append = function (data) {
        compose_content = data;
    };
    compose_state.message_content('Hey @all');
    assert(!compose.validate());
    assert.equal($("#compose-send-button").attr('disabled'), undefined);
    assert(!$("#send-status").visible());
    assert.equal(compose_content, 'compose_all_everyone_stub');
    assert($("#compose-all-everyone").visible());
}());

(function test_send_message_success() {
    blueslip.error = noop;
    blueslip.log = noop;
    $("#new_message_content").val('foobarfoobar');
    $("#new_message_content").blur();
    $("#send-status").show();
    $("#compose-send-button").attr('disabled', 'disabled');
    $("#sending-indicator").show();
    global.feature_flags.log_send_times = true;
    global.feature_flags.collect_send_times = true;
    var set_timeout_called = false;
    global.patch_builtin('setTimeout', function (func, delay) {
        assert.equal(delay, 5000);
        func();
        set_timeout_called = true;
    });
    var server_events_triggered;
    global.server_events = {
        restart_get_events: function () {
            server_events_triggered = true;
        },
    };
    var reify_message_id_checked;
    echo.reify_message_id = function (local_id, message_id) {
        assert.equal(local_id, 1001);
        assert.equal(message_id, 12);
        reify_message_id_checked = true;
    };
    var test_date = 'Wed Jun 28 2017 22:12:48 GMT+0000 (UTC)';
    compose.send_message_success(1001, 12, new Date(test_date), false);
    assert.equal($("#new_message_content").val(), '');
    assert($("#new_message_content").is_focused());
    assert(!$("#send-status").visible());
    assert.equal($("#compose-send-button").attr('disabled'), undefined);
    assert(!$("#sending-indicator").visible());
    assert.equal(_.keys(compose.send_times_data).length, 1);
    assert.equal(compose.send_times_data[12].start.getTime(), new Date(test_date).getTime());
    assert(!compose.send_times_data[12].locally_echoed);
    assert(reify_message_id_checked);
    assert(server_events_triggered);
    assert(set_timeout_called);
}());

(function test_mark_rendered_content_disparity() {
    compose.mark_rendered_content_disparity(13, true);
    assert.deepEqual(compose.send_times_data[13], { rendered_content_disparity: true });
}());

(function test_report_as_received() {
    var msg = {
        id: 12,
        sent_by_me: true,
    };
    var set_timeout_called = false;
    global.patch_builtin('setTimeout', function (func, delay) {
        assert.equal(delay, 0);
        func();
        set_timeout_called = true;
    });
    compose.send_times_data[12].locally_echoed = true;
    channel.post = function (payload) {
        assert.equal(payload.url, '/json/report_send_time');
        assert.equal(typeof(payload.data.time), 'string');
        assert(payload.data.locally_echoed);
        assert(!payload.data.rendered_content_disparity);
    };
    compose.report_as_received(msg);
    assert.equal(typeof(compose.send_times_data[12].received), 'object');
    assert.equal(typeof(compose.send_times_data[12].displayed), 'object');
    assert(set_timeout_called);

    delete compose.send_times_data[13];
    msg.id = 13;
    compose.report_as_received(msg);
    assert.equal(typeof(compose.send_times_data[13].received), 'object');
    assert.equal(typeof(compose.send_times_data[13].displayed), 'object');
}());

(function test_send_message() {
    // This is the common setup stuff for all of the four tests.
    var stub_state;
    function initialize_state_stub_dict() {
        stub_state = {};
        stub_state.local_id_counter = 0;
        stub_state.send_msg_ajax_post_called = 0;
        stub_state.get_events_running_called = 0;
        stub_state.server_events_triggered = 0;
        stub_state.reify_message_id_checked = 0;
        return stub_state;
    }

    global.patch_builtin('setTimeout', function (func) {
        func();
    });
    global.server_events = {
        restart_get_events: function () {
            stub_state.server_events_triggered += 1;
        },
        assert_get_events_running: function () {
            stub_state.get_events_running_called += 1;
        },
    };

    // Tests start here.
    (function test_message_send_success_codepath() {
        stub_state = initialize_state_stub_dict();
        compose_state.subject('');
        compose_state.set_message_type('private');
        page_params.user_id = 101;
        compose_state.recipient('alice@example.com');
        echo.try_deliver_locally = function () {
            stub_state.local_id_counter += 1;
            return stub_state.local_id_counter;
        };
        channel.post = function (payload) {
            var single_msg = {
              type: 'private',
              content: '[foobar](/user_uploads/123456)',
              sender_id: 101,
              queue_id: undefined,
              stream: '',
              subject: '',
              to: '["alice@example.com"]',
              reply_to: 'alice@example.com',
              private_message_recipient: 'alice@example.com',
              to_user_ids: '31',
              local_id: 1,
            };
            assert.equal(payload.url, '/json/messages');
            assert.equal(_.keys(payload.data).length, 11);
            assert.deepEqual(payload.data, single_msg);
            payload.data.id = stub_state.local_id_counter;
            payload.success(payload.data);
            stub_state.send_msg_ajax_post_called += 1;
        };
        echo.reify_message_id = function (local_id, message_id) {
            assert.equal(typeof(local_id), 'number');
            assert.equal(typeof(message_id), 'number');
            stub_state.reify_message_id_checked += 1;
        };
        compose.send_times_data = {};
        // Setting message content with a host server link and we will assert
        // later that this has been converted to a relative link.
        $("#new_message_content").val('[foobar]' +
                                      '(https://foo.com/user_uploads/123456)');
        $("#new_message_content").blur();
        $("#send-status").show();
        $("#compose-send-button").attr('disabled', 'disabled');
        $("#sending-indicator").show();

        compose.send_message();

        var state = {
            local_id_counter: 1,
            get_events_running_called: 1,
            reify_message_id_checked: 1,
            send_msg_ajax_post_called: 1,
            server_events_triggered: 1,
        };
        assert.deepEqual(stub_state, state);
        assert.equal(_.keys(compose.send_times_data).length, 1);
        assert.equal($("#new_message_content").val(), '');
        assert($("#new_message_content").is_focused());
        assert(!$("#send-status").visible());
        assert.equal($("#compose-send-button").attr('disabled'), undefined);
        assert(!$("#sending-indicator").visible());
    }());

    (function test_error_code_path_when_error_type_not_timeout() {
        stub_state = initialize_state_stub_dict();
        compose_state.set_message_type('stream');
        var server_error_triggered = false;
        channel.post = function (payload) {
            payload.error('500', 'Internal Server Error');
            stub_state.send_msg_ajax_post_called += 1;
            server_error_triggered = true;
        };
        var reload_initiate_triggered = false;
        global.reload = {
            is_pending: function () { return true; },
            initiate: function () {
                reload_initiate_triggered = true;
            },
        };

        compose.send_message();

        var state = {
            local_id_counter: 1,
            get_events_running_called: 1,
            reify_message_id_checked: 0,
            send_msg_ajax_post_called: 1,
            server_events_triggered: 0,
        };
        assert.deepEqual(stub_state, state);
        assert.equal(_.keys(compose.send_times_data).length, 1);
        assert(server_error_triggered);
        assert(reload_initiate_triggered);
    }());

    // This is the additional setup which is common to both the tests below.
    var server_error_triggered = false;
    var reload_initiate_triggered = false;
    channel.post = function (payload) {
        payload.error('408', 'timeout');
        stub_state.send_msg_ajax_post_called += 1;
        server_error_triggered = true;
    };
    var xhr_error_msg_checked = false;
    channel.xhr_error_message = function (error, xhr) {
        assert.equal(error, 'Error sending message');
        assert.equal(xhr, '408');
        xhr_error_msg_checked = true;
        return 'Error sending message: Server says 408';
    };
    var echo_error_msg_checked = false;
    echo.message_send_error = function (local_id, error_response) {
        assert.equal(local_id, 1);
        assert.equal(error_response, 'Error sending message: Server says 408');
        echo_error_msg_checked = true;
    };

    // Tests start here.
    (function test_param_error_function_passed_from_send_message() {
        stub_state = initialize_state_stub_dict();

        compose.send_message();

        var state = {
            local_id_counter: 1,
            get_events_running_called: 1,
            reify_message_id_checked: 0,
            send_msg_ajax_post_called: 1,
            server_events_triggered: 0,
        };
        assert.deepEqual(stub_state, state);
        assert.equal(_.keys(compose.send_times_data).length, 1);
        assert(server_error_triggered);
        assert(!reload_initiate_triggered);
        assert(xhr_error_msg_checked);
        assert(echo_error_msg_checked);
    }());

    (function test_error_codepath_local_id_undefined() {
        stub_state = initialize_state_stub_dict();
        $("#new_message_content").val('foobarfoobar');
        $("#new_message_content").blur();
        $("#send-status").show();
        $("#compose-send-button").attr('disabled', 'disabled');
        $("#sending-indicator").show();
        $("#new_message_content").select(noop);
        echo_error_msg_checked = false;
        xhr_error_msg_checked = false;
        server_error_triggered = false;
        reload_initiate_triggered = false;
        echo.try_deliver_locally = function () {
            return;
        };

        compose.send_message();

        var state = {
            local_id_counter: 0,
            get_events_running_called: 1,
            reify_message_id_checked: 0,
            send_msg_ajax_post_called: 1,
            server_events_triggered: 0,
        };
        assert.deepEqual(stub_state, state);
        assert.equal(_.keys(compose.send_times_data).length, 1);
        assert(server_error_triggered);
        assert(!reload_initiate_triggered);
        assert(xhr_error_msg_checked);
        assert(!echo_error_msg_checked);
        assert.equal($("#compose-send-button").attr('disabled'), undefined);
        assert.equal($('#error-msg').html(),
                       'Error sending message: Server says 408');
        assert.equal($("#new_message_content").val(), 'foobarfoobar');
        assert($("#new_message_content").is_focused());
        assert($("#send-status").visible());
        assert.equal($("#compose-send-button").attr('disabled'), undefined);
        assert(!$("#sending-indicator").visible());
    }());
}());

(function test_set_focused_recipient() {
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);

    var page = {
        '#stream': 'social',
        '#subject': 'lunch',
        '#new_message_content': 'burrito',
        '#private_message_recipient': 'alice@example.com,    bob@example.com',
    };

    global.$ = function (selector) {
        return {
            val: function () {
                return page[selector];
            },
        };
    };

    global.compose_state.get_message_type = function () {
        return 'stream';
    };

    global.$.trim = function (s) {
        return s;
    };


    var message = compose.create_message_object();
    assert.equal(message.to, 'social');
    assert.equal(message.subject, 'lunch');
    assert.equal(message.content, 'burrito');

    global.compose_state.get_message_type = function () {
        return 'private';
    };
    message = compose.create_message_object();
    assert.deepEqual(message.to, ['alice@example.com', 'bob@example.com']);
    assert.equal(message.to_user_ids, '31,32');
    assert.equal(message.content, 'burrito');

}());
